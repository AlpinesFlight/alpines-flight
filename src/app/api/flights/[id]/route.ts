import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recalcAircraftMaintenanceStatuses } from "@/lib/maintenance";
import { safeUserSelect } from "@/lib/selects";
import { canManageFinance } from "@/lib/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const flight = await prisma.flightLog.findUnique({
    where: { id },
    include: {
      aircraft: true,
      student: { select: safeUserSelect },
      instructor: { select: safeUserSelect },
      stops: true,
      trainingProgram: { select: { id: true, code: true, title: true, instructionRateCents: true } },
      accountTransaction: true,
    },
  });
  if (!flight) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (session.user.role === "STUDENT" && flight.studentId !== session.user.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(flight);
}

const editSchema = z.object({
  departureTime: z.string().optional(),
  arrivalTime: z.string().optional(),
  totalLandings: z.number().int().nonnegative().optional(),
  remarks: z.string().nullable().optional(),
  aircraftCostCents: z.number().int().nonnegative().optional(),
  instructionCostCents: z.number().int().nonnegative().optional(),
  fuelRefillDone: z.boolean().optional(),
  fuelCard: z.enum(["BP", "TOTAL", "BADGE_TALLARD"]).nullable().optional(),
  fuelLiters: z.number().positive().nullable().optional(),
  fuelType: z.enum(["AVGAS_100LL", "SP98"]).nullable().optional(),
  fuelAirfield: z.string().nullable().optional(),
});

// Corrige un vol déjà clôturé (erreur de saisie) — Gérant uniquement
// (correction financière). Ne
// permet pas de changer l'avion/élève/instructeur (pour ça, supprimer le
// vol et le ressaisir depuis le planning). Si la durée ou les coûts
// changent, répercute le delta sur le solde du pilote, ses heures totales,
// les heures/cycles de l'avion et sa transaction reliée (garde tout
// cohérent), puis recalcule les échéances maintenance.
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageFinance(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = editSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.flightLog.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const departureTime = parsed.data.departureTime ? new Date(parsed.data.departureTime) : existing.departureTime;
  const arrivalTime = parsed.data.arrivalTime ? new Date(parsed.data.arrivalTime) : existing.arrivalTime;
  const duration = Math.round(((arrivalTime.getTime() - departureTime.getTime()) / 3_600_000) * 10) / 10;
  if (duration <= 0) {
    return NextResponse.json(
      { error: "L'heure d'arrivée doit être après l'heure de départ." },
      { status: 400 }
    );
  }

  const newAircraftCost = parsed.data.aircraftCostCents ?? existing.aircraftCostCents;
  const newInstructionCost = parsed.data.instructionCostCents ?? existing.instructionCostCents;
  const newLandings = parsed.data.totalLandings ?? existing.totalLandings;
  const fuelRefillDone = parsed.data.fuelRefillDone ?? existing.fuelRefillDone;

  const durationDelta = duration - existing.duration;
  const landingsDelta = newLandings - existing.totalLandings;
  const costDelta = newAircraftCost + newInstructionCost - (existing.aircraftCostCents + existing.instructionCostCents);

  const result = await prisma.$transaction(async (db) => {
    const flight = await db.flightLog.update({
      where: { id },
      data: {
        departureTime,
        arrivalTime,
        duration,
        totalLandings: newLandings,
        remarks: parsed.data.remarks,
        aircraftCostCents: newAircraftCost,
        instructionCostCents: newInstructionCost,
        fuelRefillDone: parsed.data.fuelRefillDone,
        fuelCard: fuelRefillDone ? parsed.data.fuelCard : null,
        fuelLiters: fuelRefillDone ? parsed.data.fuelLiters : null,
        fuelType: fuelRefillDone ? parsed.data.fuelType : null,
        fuelAirfield: fuelRefillDone ? parsed.data.fuelAirfield : null,
      },
      include: { stops: true, aircraft: true },
    });

    if (existing.studentId && (durationDelta !== 0 || costDelta !== 0)) {
      await db.studentProfile.update({
        where: { userId: existing.studentId },
        data: {
          totalHours: { increment: durationDelta },
          balanceCents: { decrement: costDelta },
        },
      });
    }

    if (durationDelta !== 0 || landingsDelta !== 0) {
      await db.aircraft.update({
        where: { id: existing.aircraftId },
        data: {
          totalHours: { increment: durationDelta },
          totalCycles: { increment: landingsDelta },
        },
      });
    }

    if (costDelta !== 0) {
      await db.accountTransaction.updateMany({
        where: { flightLogId: id },
        data: { amountCents: { decrement: costDelta } },
      });
    }

    return flight;
  });

  if (durationDelta !== 0 || landingsDelta !== 0) {
    await recalcAircraftMaintenanceStatuses(prisma, existing.aircraftId);
  }

  return NextResponse.json(result);
}

// Supprime un vol — annule intégralement son effet : solde et heures du
// pilote, heures/cycles de l'avion, transaction reliée, puis déverrouille
// la réservation d'origine (repasse en CONFIRMED, comme si elle n'avait
// jamais été clôturée). Admin uniquement — irréversible.
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageFinance(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.flightLog.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.$transaction(async (db) => {
    await db.accountTransaction.deleteMany({ where: { flightLogId: id } });

    if (existing.studentId) {
      await db.studentProfile.update({
        where: { userId: existing.studentId },
        data: {
          totalHours: { decrement: existing.duration },
          balanceCents: { increment: existing.aircraftCostCents + existing.instructionCostCents },
        },
      });
    }

    await db.aircraft.update({
      where: { id: existing.aircraftId },
      data: {
        totalHours: { decrement: existing.duration },
        totalCycles: { decrement: existing.totalLandings },
      },
    });

    if (existing.reservationId) {
      await db.reservation.updateMany({
        where: { id: existing.reservationId, status: "COMPLETED" },
        data: { status: "CONFIRMED" },
      });
    }

    await db.flightLog.delete({ where: { id } });
  });

  await recalcAircraftMaintenanceStatuses(prisma, existing.aircraftId);

  return NextResponse.json({ ok: true });
}
