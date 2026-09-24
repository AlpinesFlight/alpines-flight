import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recalcAircraftMaintenanceStatuses, closeMaintenanceRecord } from "@/lib/maintenance";
import { canManageSchool } from "@/lib/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  label: z.string().min(2).optional(),
  type: z.enum(["HOURLY", "CALENDAR", "CYCLES"]).optional(),
  dueAtHours: z.number().nullable().optional(),
  dueAtDate: z.string().nullable().optional(),
  dueAtCycles: z.number().int().nullable().optional(),
  alertBefore: z.number().optional(),
  // Un seul à la fois, cohérent avec `type` — voir le .refine plus bas.
  intervalHours: z.number().positive().nullable().optional(),
  intervalDays: z.number().int().positive().nullable().optional(),
  intervalCycles: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
  // Marquer l'échéance comme faite : bascule status=DONE et consigne
  // automatiquement l'intervention au kardex de l'avion.
  markDone: z
    .object({
      performedBy: z.string().optional().nullable(),
      reference: z.string().optional().nullable(),
      description: z.string().optional().nullable(),
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

  const existing = await prisma.maintenanceRecord.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { markDone, dueAtDate, ...rest } = parsed.data;

  const record = await prisma.$transaction(async (db) => {
    let updated = await db.maintenanceRecord.update({
      where: { id },
      data: {
        ...rest,
        ...(dueAtDate !== undefined
          ? { dueAtDate: dueAtDate ? new Date(dueAtDate) : null }
          : {}),
      },
    });

    if (markDone) {
      await closeMaintenanceRecord(db, updated, {
        performedBy: markDone.performedBy,
        reference: markDone.reference,
        description: markDone.description,
        createdById: session.user.id,
      });
      updated = await db.maintenanceRecord.findUniqueOrThrow({ where: { id } });
    } else {
      // Champs modifiés sans marquer "fait" : on retrouve un statut
      // cohérent avec les nouvelles échéances (sauf si déjà soldée).
      await recalcAircraftMaintenanceStatuses(db, updated.aircraftId);
      updated = await db.maintenanceRecord.findUniqueOrThrow({ where: { id } });
    }

    return updated;
  });

  return NextResponse.json(record);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.maintenanceRecord.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
