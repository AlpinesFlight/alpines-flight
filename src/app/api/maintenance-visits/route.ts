import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect, safeAircraftSelect } from "@/lib/selects";
import { canManageSchool } from "@/lib/permissions";
import { z } from "zod";

// Liste des visites (ordres de travail), toute la flotte — page Gestion →
// Maintenance. ?status=OPEN|CLOSED filtre ; ?aircraftId= restreint à un avion
// (utilisé par l'onglet Échéances de Flotte pour signaler qu'une échéance
// est déjà prise dans une visite en cours).
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");
  const status = statusParam === "OPEN" || statusParam === "CLOSED" ? statusParam : undefined;
  const aircraftId = searchParams.get("aircraftId") ?? undefined;

  const visits = await prisma.maintenanceVisit.findMany({
    where: { ...(status ? { status } : {}), ...(aircraftId ? { aircraftId } : {}) },
    include: {
      aircraft: { select: safeAircraftSelect },
      openedBy: { select: safeUserSelect },
      closedBy: { select: safeUserSelect },
      records: true,
      _count: { select: { documents: true } },
    },
    orderBy: [{ status: "asc" }, { openedAt: "desc" }],
  });
  return NextResponse.json(visits);
}

const createSchema = z.object({
  aircraftId: z.string(),
  title: z.string().min(2).optional(),
});

// Ouvrir une visite : rattache automatiquement toutes les échéances DUE/
// OVERDUE de cet avion pas déjà prises dans une autre visite en cours — "les
// travaux à effectuer sont automatiquement calculés à partir des potentiels
// de l'aéronef" au lancement. Des échéances individuelles peuvent ensuite
// être ajoutées/retirées depuis le détail de la visite (PATCH).
export async function POST(req: Request) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const { aircraftId, title } = parsed.data;

  const aircraft = await prisma.aircraft.findUnique({ where: { id: aircraftId } });
  if (!aircraft) return NextResponse.json({ error: "Avion introuvable." }, { status: 404 });

  const dueRecords = await prisma.maintenanceRecord.findMany({
    where: { aircraftId, status: { in: ["DUE", "OVERDUE"] }, maintenanceVisitId: null },
  });

  const visit = await prisma.$transaction(async (db) => {
    const created = await db.maintenanceVisit.create({
      data: {
        aircraftId,
        title: title || dueRecords.map((r) => r.label).join(" + ") || `Visite ${aircraft.registration}`,
        openedById: session.user.id,
      },
    });
    if (dueRecords.length > 0) {
      await db.maintenanceRecord.updateMany({
        where: { id: { in: dueRecords.map((r) => r.id) } },
        data: { maintenanceVisitId: created.id },
      });
    }
    return db.maintenanceVisit.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        aircraft: { select: safeAircraftSelect },
        openedBy: { select: safeUserSelect },
        closedBy: { select: safeUserSelect },
        records: true,
        _count: { select: { documents: true } },
      },
    });
  });

  return NextResponse.json(visit, { status: 201 });
}
