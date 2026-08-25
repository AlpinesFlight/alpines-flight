import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect } from "@/lib/selects";
import { recalcAircraftMaintenanceStatuses } from "@/lib/maintenance";
import { isInstructorOrAbove } from "@/lib/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const schema = z
  .object({
    departureTime: z.string(),
    arrivalTime: z.string(),
    instructorId: z.string().nullable().optional(),
    trainingProgramId: z.string().nullable().optional(),
    remarks: z.string().nullable().optional(),
    stops: z
      .array(
        z.object({
          airfield: z.string().min(1),
          touchAndGo: z.number().int().positive(),
        })
      )
      .min(1, "Au moins un terrain doit être renseigné."),
    fuelRefillDone: z.boolean().optional().default(false),
    fuelCard: z.enum(["BP", "TOTAL", "BADGE_TALLARD"]).optional().nullable(),
    fuelLiters: z.number().positive().optional().nullable(),
    fuelType: z.enum(["AVGAS_100LL", "SP98"]).optional().nullable(),
    fuelAirfield: z.string().optional().nullable(),
  })
  .refine(
    (d) => !d.fuelRefillDone || (d.fuelCard && d.fuelLiters && d.fuelType && d.fuelAirfield),
    {
      message:
        "Si le plein a été fait, la carte, le nombre de litres, le type de carburant et le terrain sont requis.",
      path: ["fuelRefillDone"],
    }
  );

// Compte-rendu de vol rempli par le pilote (ou l'admin/instructeur) au
// retour : heures réelles, terrains + touchés, instructeur, plein éventuel.
// Crée le carnet de vol, débite automatiquement le compte pilote (avion +
// prestation d'instruction si vol d'instruction) sauf s'il n'y a pas
// d'élève associé (vol découverte/baptême — voir plus bas), et met à jour
// les heures / cycles de l'avion (déclenchant le recalcul des échéances
// maintenance).
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const {
    departureTime,
    arrivalTime,
    instructorId,
    trainingProgramId,
    remarks,
    stops,
    fuelRefillDone,
    fuelCard,
    fuelLiters,
    fuelType,
    fuelAirfield,
  } = parsed.data;
  const start = new Date(departureTime);
  const end = new Date(arrivalTime);
  const duration = Math.round(((end.getTime() - start.getTime()) / 3_600_000) * 10) / 10;

  if (duration <= 0) {
    return NextResponse.json(
      { error: "L'heure d'arrivée doit être après l'heure de départ." },
      { status: 400 }
    );
  }

  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: { aircraft: true },
  });
  if (!reservation) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isOwner = reservation.studentId === session.user.id;
  const isStaff = isInstructorOrAbove(session.user.role);
  if (!isStaff && !isOwner) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (reservation.status !== "CONFIRMED" && reservation.status !== "IN_FLIGHT") {
    return NextResponse.json(
      { error: "Ce vol a déjà été clôturé ou annulé." },
      { status: 409 }
    );
  }
  const totalLandings = stops.reduce((sum, s) => sum + s.touchAndGo, 0);
  const finalInstructorId =
    instructorId !== undefined ? instructorId : reservation.instructorId;
  const finalTrainingProgramId =
    trainingProgramId !== undefined ? trainingProgramId : reservation.trainingProgramId;

  const aircraftCostCents = Math.round(duration * reservation.aircraft.hourlyRateCents);

  // Tarif d'instruction : priorité au tarif propre à la formation visée
  // (ex: PPL 25€/h, Montagne 40€/h — voir TrainingProgram.instructionRateCents),
  // sinon repli sur le tarif horaire par défaut de l'instructeur.
  let instructionCostCents = 0;
  if (reservation.type === "INSTRUCTION" && finalInstructorId) {
    let rateCents: number | null = null;
    if (finalTrainingProgramId) {
      const program = await prisma.trainingProgram.findUnique({
        where: { id: finalTrainingProgramId },
        select: { instructionRateCents: true },
      });
      rateCents = program?.instructionRateCents ?? null;
    }
    if (!rateCents) {
      const instructorProfile = await prisma.instructorProfile.findUnique({
        where: { userId: finalInstructorId },
      });
      rateCents = instructorProfile?.hourlyRateCents ?? null;
    }
    if (rateCents) {
      instructionCostCents = Math.round(duration * rateCents);
    }
  }
  const amountCents = aircraftCostCents + instructionCostCents;

  const result = await prisma.$transaction(async (db) => {
    const flight = await db.flightLog.create({
      data: {
        reservationId: reservation.id,
        aircraftId: reservation.aircraftId,
        studentId: reservation.studentId,
        instructorId: finalInstructorId,
        trainingProgramId: finalTrainingProgramId,
        date: reservation.startTime,
        departureTime: start,
        arrivalTime: end,
        duration,
        totalLandings,
        aircraftCostCents,
        instructionCostCents,
        remarks,
        stops: { create: stops },
        fuelRefillDone,
        fuelCard: fuelRefillDone ? fuelCard : null,
        fuelLiters: fuelRefillDone ? fuelLiters : null,
        fuelType: fuelRefillDone ? fuelType : null,
        fuelAirfield: fuelRefillDone ? fuelAirfield : null,
      },
      include: {
        stops: true,
        trainingProgram: { select: { id: true, code: true, title: true, instructionRateCents: true } },
      },
    });

    // Vol sans élève associé (vol découverte/baptême typiquement) : rien à
    // débiter — le forfait éventuel (Reservation.priceCents) est encaissé
    // directement sur place, jamais via le grand livre des comptes pilotes.
    let transaction = null;
    if (reservation.studentId) {
      const notesParts = [`Avion ${reservation.aircraft.registration} — ${duration}h`];
      if (instructionCostCents > 0) notesParts.push(`Instruction — ${duration}h`);

      transaction = await db.accountTransaction.create({
        data: {
          studentId: reservation.studentId,
          type: "FLIGHT_DEBIT",
          status: "CONFIRMED",
          amountCents: -amountCents,
          flightLogId: flight.id,
          notes: notesParts.join(" + "),
          confirmedAt: new Date(),
          confirmedById: session.user.id,
        },
        include: { student: { select: safeUserSelect } },
      });

      await db.studentProfile.update({
        where: { userId: reservation.studentId },
        data: {
          balanceCents: { decrement: amountCents },
          totalHours: { increment: duration },
        },
      });
    }

    await db.aircraft.update({
      where: { id: reservation.aircraftId },
      data: {
        totalHours: { increment: duration },
        totalCycles: { increment: totalLandings },
      },
    });

    await db.reservation.update({
      where: { id: reservation.id },
      // L'horaire affiché sur le planning devient l'horaire réel du vol
      // (départ/arrivée saisis au compte-rendu), pas l'horaire initialement
      // réservé — pour que la case sur le planning corresponde à ce qui
      // s'est vraiment passé.
      data: { status: "COMPLETED", startTime: start, endTime: end },
    });

    await recalcAircraftMaintenanceStatuses(db, reservation.aircraftId);

    return { flight, transaction, aircraftCostCents, instructionCostCents, totalCents: amountCents };
  });

  return NextResponse.json(result, { status: 201 });
}
