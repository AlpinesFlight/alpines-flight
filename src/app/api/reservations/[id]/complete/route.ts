import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect, safeAircraftSelect } from "@/lib/selects";
import { recalcAircraftMaintenanceStatuses } from "@/lib/maintenance";
import { isInstructorOrAbove } from "@/lib/permissions";
import { effectiveAircraftRateCents } from "@/lib/reservations";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const schema = z
  .object({
    departureTime: z.string(),
    arrivalTime: z.string(),
    departureAirfield: z.string().min(1, "Terrain de départ requis."),
    arrivalAirfield: z.string().min(1, "Terrain de destination requis."),
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
// d'élève associé (vol découverte) ou si c'est un vol baptême — choisi à
// la réservation, pas ici, voir Reservation.isBaptism plus bas — et met à
// jour les heures / cycles de l'avion (déclenchant le recalcul des
// échéances maintenance).
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const {
    departureTime,
    arrivalTime,
    departureAirfield,
    arrivalAirfield,
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
    include: {
      aircraft: { select: safeAircraftSelect },
      student: { select: { studentProfile: { select: { canGiveBaptism: true } } } },
    },
  });
  if (!reservation) return NextResponse.json({ error: "not found" }, { status: 404 });

  // La décision "vol baptême" a été prise à la réservation
  // (Reservation.isBaptism, voir POST/PATCH /api/reservations) — revérifiée
  // ici, pas simplement recopiée : si l'autorisation du pilote a été
  // retirée entre la réservation et le vol, elle ne doit plus s'appliquer.
  const isBaptism = reservation.isBaptism && reservation.student?.studentProfile?.canGiveBaptism === true;

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
  // +1 : l'atterrissage à destination compte par défaut, en plus des
  // touchés éventuels aux terrains intermédiaires (stops) — sans ça, un
  // vol direct sans arrêt en route (stops vide) comptait 0 atterrissage
  // alors que se poser à l'arrivée en est bien un.
  const totalLandings = stops.reduce((sum, s) => sum + s.touchAndGo, 0) + 1;
  const finalInstructorId =
    instructorId !== undefined ? instructorId : reservation.instructorId;
  const finalTrainingProgramId =
    trainingProgramId !== undefined ? trainingProgramId : reservation.trainingProgramId;

  // Tarif avion : dérogation Gérant (voir PilotAircraftRate) si elle existe
  // pour ce pilote sur cet avion précis, sinon le tarif standard de
  // l'avion. Toujours relu en base ici, jamais fait confiance à une valeur
  // transmise par le client — même logique que canGiveBaptism ci-dessus.
  const effectiveRateCents = await effectiveAircraftRateCents(
    reservation.studentId,
    reservation.aircraftId,
    reservation.aircraft.hourlyRateCents
  );
  const aircraftCostCents = Math.round(duration * effectiveRateCents);

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
        departureAirfield: departureAirfield.trim().toUpperCase(),
        arrivalAirfield: arrivalAirfield.trim().toUpperCase(),
        duration,
        totalLandings,
        aircraftCostCents,
        instructionCostCents,
        isBaptism,
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

    // Vol sans élève associé (vol découverte/baptême client, sans compte) :
    // rien à débiter — le forfait éventuel (Reservation.priceCents) est
    // encaissé directement sur place, jamais via le grand livre des comptes
    // pilotes. Même chose pour un vol baptême donné par un pilote autorisé
    // (isBaptism) : lui a bien un compte, mais ce vol-là ne le débite pas —
    // voir StudentProfile.canGiveBaptism plus haut.
    let transaction = null;
    if (reservation.studentId && !isBaptism) {
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
    }

    // Les heures volées comptent pour le pilote qu'il ait payé ou non ce
    // vol précis (carnet de vol réel) — seul le débit est conditionnel,
    // voir juste au-dessus.
    if (reservation.studentId) {
      await db.studentProfile.update({
        where: { userId: reservation.studentId },
        data: {
          totalHours: { increment: duration },
          ...(isBaptism ? {} : { balanceCents: { decrement: amountCents } }),
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
