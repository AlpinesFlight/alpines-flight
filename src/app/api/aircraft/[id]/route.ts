import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recalcAircraftMaintenanceStatuses } from "@/lib/maintenance";
import { safeAircraftSelect } from "@/lib/selects";
import { canManageSchool } from "@/lib/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const aircraft = await prisma.aircraft.findUnique({
    where: { id },
    select: {
      ...safeAircraftSelect,
      maintenanceRecords: { orderBy: [{ status: "asc" }, { dueAtDate: "asc" }] },
      kardexEntries: { orderBy: { date: "desc" } },
    },
  });
  if (!aircraft) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(aircraft);
}

const patchSchema = z.object({
  registration: z.string().min(2).optional(),
  type: z.string().min(2).optional(),
  hourlyRateCents: z.number().int().positive().optional(),
  status: z.enum(["AVAILABLE", "MAINTENANCE", "GROUNDED", "RETIRED"]).optional(),
  totalHours: z.number().nonnegative().optional(),
  totalCycles: z.number().int().nonnegative().optional(),
  color: z.string().optional(),
  notes: z.string().nullable().optional(),
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

  const existing = await prisma.aircraft.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (parsed.data.registration && parsed.data.registration !== existing.registration) {
    const dup = await prisma.aircraft.findUnique({
      where: { registration: parsed.data.registration },
    });
    if (dup) {
      return NextResponse.json(
        { error: "Cette immatriculation est déjà utilisée." },
        { status: 409 }
      );
    }
  }

  const aircraft = await prisma.aircraft.update({
    where: { id },
    data: parsed.data,
    select: safeAircraftSelect,
  });

  // Si les heures/cycles ont été corrigés manuellement, les échéances
  // (DUE/OVERDUE/UPCOMING) sont recalculées en conséquence.
  if (parsed.data.totalHours !== undefined || parsed.data.totalCycles !== undefined) {
    await recalcAircraftMaintenanceStatuses(prisma, id);
  }

  return NextResponse.json(aircraft);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  const [flightCount, reservationCount, transactionCount] = await Promise.all([
    prisma.flightLog.count({ where: { aircraftId: id } }),
    prisma.reservation.count({ where: { aircraftId: id } }),
    prisma.accountTransaction.count({ where: { flightLog: { aircraftId: id } } }),
  ]);

  if (flightCount > 0 || reservationCount > 0 || transactionCount > 0) {
    return NextResponse.json(
      {
        error:
          "Cet avion a un historique (vols, réservations ou facturation) et ne peut pas être supprimé définitivement. Passez-le en statut « Retiré » pour le sortir de la flotte active tout en conservant l'historique.",
      },
      { status: 409 }
    );
  }

  await prisma.aircraft.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
