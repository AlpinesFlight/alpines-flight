import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect, safeAircraftSelect } from "@/lib/selects";
import { canManageSchool } from "@/lib/permissions";
import { closeMaintenanceRecord } from "@/lib/maintenance";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const includeShape = {
  aircraft: { select: safeAircraftSelect },
  openedBy: { select: safeUserSelect },
  closedBy: { select: safeUserSelect },
  records: true,
  kardexEntries: true,
  documents: {
    select: {
      id: true,
      visitId: true,
      fileName: true,
      fileMimeType: true,
      fileSize: true,
      uploadedAt: true,
      uploadedById: true,
      uploadedBy: { select: safeUserSelect },
    },
  },
} as const;

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const visit = await prisma.maintenanceVisit.findUnique({ where: { id }, include: includeShape });
  if (!visit) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(visit);
}

const patchSchema = z.object({
  title: z.string().min(2).optional(),
  performedBy: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  // Rattacher/détacher des échéances de cette visite (ex: le Gérant ajoute à
  // la volée une échéance encore UPCOMING qu'il veut traiter maintenant).
  addRecordIds: z.array(z.string()).optional(),
  removeRecordIds: z.array(z.string()).optional(),
  // Clôturer : solde toutes les échéances encore rattachées (closeMaintenanceRecord
  // pour chacune — statut DONE, Kardex, renouvellement auto le cas échéant),
  // "les potentiels sont automatiquement recalculés".
  close: z
    .object({
      description: z.string().nullable().optional(),
    })
    .optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const existing = await prisma.maintenanceVisit.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.status === "CLOSED")
    return NextResponse.json({ error: "Cette visite est déjà clôturée." }, { status: 409 });

  const { addRecordIds, removeRecordIds, close, ...rest } = parsed.data;

  await prisma.$transaction(async (db) => {
    if (Object.keys(rest).length > 0) {
      await db.maintenanceVisit.update({ where: { id }, data: rest });
    }

    if (addRecordIds && addRecordIds.length > 0) {
      await db.maintenanceRecord.updateMany({
        where: { id: { in: addRecordIds }, aircraftId: existing.aircraftId, status: { not: "DONE" } },
        data: { maintenanceVisitId: id },
      });
    }
    if (removeRecordIds && removeRecordIds.length > 0) {
      await db.maintenanceRecord.updateMany({
        where: { id: { in: removeRecordIds }, maintenanceVisitId: id },
        data: { maintenanceVisitId: null },
      });
    }

    if (close) {
      const attached = await db.maintenanceRecord.findMany({
        where: { maintenanceVisitId: id, status: { not: "DONE" } },
      });
      for (const record of attached) {
        await closeMaintenanceRecord(db, record, {
          performedBy: rest.performedBy ?? existing.performedBy,
          reference: rest.reference ?? existing.reference,
          description: close.description,
          createdById: session.user.id,
          maintenanceVisitId: id,
        });
      }
      await db.maintenanceVisit.update({
        where: { id },
        data: { status: "CLOSED", closedAt: new Date(), closedById: session.user.id },
      });
    }
  });

  const fresh = await prisma.maintenanceVisit.findUniqueOrThrow({ where: { id }, include: includeShape });
  return NextResponse.json(fresh);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.maintenanceVisit.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.status === "CLOSED")
    return NextResponse.json(
      { error: "Une visite clôturée ne peut pas être supprimée (historique de maintenance)." },
      { status: 409 }
    );

  // onDelete: SetNull sur MaintenanceRecord.maintenanceVisitId — les
  // échéances rattachées redeviennent simplement "hors visite", jamais
  // supprimées.
  await prisma.maintenanceVisit.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
