import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recalcAircraftMaintenanceStatuses } from "@/lib/maintenance";
import { safeUserSelect, safeAircraftSelect } from "@/lib/selects";
import { canManageFinance } from "@/lib/permissions";
import { durationHours, formatHoursMinutes } from "@/lib/format";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const flight = await prisma.flightLog.findUnique({
    where: { id },
    include: {
      aircraft: { select: safeAircraftSelect },
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
  // Avion, pilote (compte débité), instructeur et formation : null retire le
  // pilote / l'instructeur / la formation. Voir la note de PATCH.
  aircraftId: z.string().min(1).optional(),
  studentId: z.string().nullable().optional(),
  instructorId: z.string().nullable().optional(),
  trainingProgramId: z.string().nullable().optional(),
  departureTime: z.string().optional(),
  arrivalTime: z.string().optional(),
  departureAirfield: z.string().nullable().optional(),
  arrivalAirfield: z.string().nullable().optional(),
  totalLandings: z.number().int().nonnegative().optional(),
  // Terrains posés / touchés en route : remplace la liste entière.
  stops: z
    .array(z.object({ airfield: z.string().min(1), touchAndGo: z.number().int().positive() }))
    .optional(),
  remarks: z.string().nullable().optional(),
  aircraftCostCents: z.number().int().nonnegative().optional(),
  instructionCostCents: z.number().int().nonnegative().optional(),
  fuelRefillDone: z.boolean().optional(),
  fuelCard: z.enum(["BP", "TOTAL", "BADGE_TALLARD"]).nullable().optional(),
  fuelLiters: z.number().positive().nullable().optional(),
  fuelType: z.enum(["AVGAS_100LL", "SP98"]).nullable().optional(),
  fuelAirfield: z.string().nullable().optional(),
});

// Même libellé que le débit créé à la clôture du vol (voir
// /api/reservations/[id]/complete et POST /api/flights).
function flightDebitNotes(registration: string, duration: number, instructionCostCents: number) {
  const parts = [`Avion ${registration} — ${formatHoursMinutes(duration)}`];
  if (instructionCostCents > 0) parts.push(`Instruction — ${formatHoursMinutes(duration)}`);
  return parts.join(" + ");
}

// Corrige un vol déjà clôturé (erreur de saisie) — Gérant uniquement
// (correction financière). Tout ce qui se saisit à la clôture peut être
// corrigé ici, y compris l'avion, le pilote, l'instructeur et la formation
// (plus besoin de supprimer le vol et de le ressaisir depuis le planning) :
// les heures et atterrissages passent de l'ancien avion au nouveau, le débit
// passe de l'ancien compte pilote au nouveau (transaction reliée comprise),
// les échéances maintenance des avions concernés sont recalculées, et la
// réservation d'origine suit (avion, pilote, instructeur, horaire) pour que
// le planning reste le reflet de ce qui s'est réellement passé. Les montants
// (avion / instruction) sont ceux envoyés par le formulaire — pas
// recalculés ici — et le solde suit leur écart.
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageFinance(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = editSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  const data = parsed.data;

  const existing = await prisma.flightLog.findUnique({
    where: { id },
    include: { trainingSession: { select: { id: true } } },
  });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const departureTime = data.departureTime ? new Date(data.departureTime) : existing.departureTime;
  const arrivalTime = data.arrivalTime ? new Date(data.arrivalTime) : existing.arrivalTime;
  const duration = durationHours(departureTime, arrivalTime);
  if (duration <= 0) {
    return NextResponse.json(
      { error: "L'heure d'arrivée doit être après l'heure de départ." },
      { status: 400 }
    );
  }

  const newAircraftId = data.aircraftId ?? existing.aircraftId;
  const newStudentId = data.studentId !== undefined ? data.studentId : existing.studentId;
  const newInstructorId = data.instructorId !== undefined ? data.instructorId : existing.instructorId;
  const aircraftChanged = newAircraftId !== existing.aircraftId;
  const studentChanged = newStudentId !== existing.studentId;
  const instructorChanged = newInstructorId !== existing.instructorId;
  const departureChanged = departureTime.getTime() !== existing.departureTime.getTime();
  const timesChanged = departureChanged || arrivalTime.getTime() !== existing.arrivalTime.getTime();
  const isBaptism = existing.isBaptism;

  // Deux FI peuvent voler ensemble (le pilote débité peut donc être un
  // instructeur), jamais le même que l'instructeur du vol.
  if (newStudentId && newInstructorId && newStudentId === newInstructorId) {
    return NextResponse.json(
      { error: "Le pilote et l'instructeur ne peuvent pas être la même personne." },
      { status: 400 }
    );
  }

  const newAircraft = await prisma.aircraft.findUnique({
    where: { id: newAircraftId },
    select: { registration: true },
  });
  if (!newAircraft) return NextResponse.json({ error: "Avion introuvable." }, { status: 404 });

  if (studentChanged && newStudentId) {
    const pilot = await prisma.user.findUnique({
      where: { id: newStudentId },
      select: { studentProfile: { select: { canGiveBaptism: true } } },
    });
    if (!pilot) return NextResponse.json({ error: "Pilote introuvable." }, { status: 400 });
    // Même règle qu'à la clôture : un vol baptême n'est sans débit que si le
    // pilote y est autorisé (StudentProfile.canGiveBaptism).
    if (isBaptism && pilot.studentProfile?.canGiveBaptism !== true) {
      return NextResponse.json(
        { error: "Ce pilote n'est pas autorisé à donner des vols baptême." },
        { status: 400 }
      );
    }
  }
  if (studentChanged && !newStudentId && isBaptism) {
    return NextResponse.json({ error: "Un vol baptême doit avoir un pilote." }, { status: 400 });
  }
  if (instructorChanged && newInstructorId) {
    const instructor = await prisma.user.findUnique({ where: { id: newInstructorId }, select: { id: true } });
    if (!instructor) return NextResponse.json({ error: "Instructeur introuvable." }, { status: 400 });
  }
  if (data.trainingProgramId && data.trainingProgramId !== existing.trainingProgramId) {
    const program = await prisma.trainingProgram.findUnique({
      where: { id: data.trainingProgramId },
      select: { id: true },
    });
    if (!program) return NextResponse.json({ error: "Formation introuvable." }, { status: 400 });
  }
  // La séance de formation reliée appartient à l'inscription de l'ancien
  // pilote : changer de pilote la laisserait pointer vers le vol d'un autre.
  if (studentChanged && existing.trainingSession) {
    return NextResponse.json(
      {
        error:
          "Ce vol est relié à une séance de formation : délie-le d'abord depuis la fiche de la séance (Formation), puis change le pilote.",
      },
      { status: 400 }
    );
  }

  const newAircraftCost = data.aircraftCostCents ?? existing.aircraftCostCents;
  const newInstructionCost = data.instructionCostCents ?? existing.instructionCostCents;
  const newLandings = data.totalLandings ?? existing.totalLandings;
  const fuelRefillDone = data.fuelRefillDone ?? existing.fuelRefillDone;

  const oldTotalCost = existing.aircraftCostCents + existing.instructionCostCents;
  const newTotalCost = newAircraftCost + newInstructionCost;
  const durationDelta = duration - existing.duration;
  const landingsDelta = newLandings - existing.totalLandings;
  const costDelta = newTotalCost - oldTotalCost;

  const result = await prisma.$transaction(async (db) => {
    const flight = await db.flightLog.update({
      where: { id },
      data: {
        aircraftId: newAircraftId,
        studentId: newStudentId,
        instructorId: newInstructorId,
        trainingProgramId: data.trainingProgramId,
        // La date du carnet (affichée sur la page Vols, utilisée pour le tri
        // et les filtres de période) suit l'heure de départ corrigée.
        ...(departureChanged ? { date: departureTime } : {}),
        departureTime,
        arrivalTime,
        departureAirfield: data.departureAirfield,
        arrivalAirfield: data.arrivalAirfield,
        duration,
        totalLandings: newLandings,
        remarks: data.remarks,
        aircraftCostCents: newAircraftCost,
        instructionCostCents: newInstructionCost,
        fuelRefillDone: data.fuelRefillDone,
        fuelCard: fuelRefillDone ? data.fuelCard : null,
        fuelLiters: fuelRefillDone ? data.fuelLiters : null,
        fuelType: fuelRefillDone ? data.fuelType : null,
        fuelAirfield: fuelRefillDone ? data.fuelAirfield : null,
        ...(data.stops ? { stops: { deleteMany: {}, create: data.stops } } : {}),
      },
      include: {
        stops: true,
        aircraft: { select: safeAircraftSelect },
        student: { select: safeUserSelect },
        instructor: { select: safeUserSelect },
        trainingProgram: { select: { id: true, code: true, title: true } },
      },
    });

    // La séance de formation reliée à ce vol porte la date de départ du vol
    // (voir POST /api/enrollments/[id]/sessions) : si l'horaire est corrigé,
    // elle et ses exercices notés suivent.
    if (departureChanged) {
      await db.trainingSession.updateMany({ where: { flightLogId: id }, data: { date: departureTime } });
      await db.exerciseProgress.updateMany({
        where: { session: { flightLogId: id } },
        data: { date: departureTime },
      });
      // Idem pour le débit du compte pilote : classé à la date du vol (voir
      // AccountTransaction.date).
      await db.accountTransaction.updateMany({ where: { flightLogId: id }, data: { date: departureTime } });
    }

    // Réservation d'origine : la clôture l'avait alignée sur le vol réel
    // (avion, pilote, instructeur, horaire) — elle reste alignée.
    if (existing.reservationId && (aircraftChanged || studentChanged || instructorChanged || timesChanged)) {
      await db.reservation.updateMany({
        where: { id: existing.reservationId },
        data: {
          ...(aircraftChanged ? { aircraftId: newAircraftId } : {}),
          ...(studentChanged ? { studentId: newStudentId } : {}),
          ...(instructorChanged ? { instructorId: newInstructorId } : {}),
          ...(timesChanged ? { startTime: departureTime, endTime: arrivalTime } : {}),
        },
      });
    }

    // Compte pilote : les heures suivent le vol (baptême compris), le solde
    // seulement pour un vol débité — voir StudentProfile.canGiveBaptism.
    if (!studentChanged) {
      if (newStudentId && (durationDelta !== 0 || costDelta !== 0)) {
        await db.studentProfile.update({
          where: { userId: newStudentId },
          data: {
            totalHours: { increment: durationDelta },
            ...(isBaptism ? {} : { balanceCents: { decrement: costDelta } }),
          },
        });
      }
    } else {
      if (existing.studentId) {
        await db.studentProfile.updateMany({
          where: { userId: existing.studentId },
          data: {
            totalHours: { decrement: existing.duration },
            ...(isBaptism ? {} : { balanceCents: { increment: oldTotalCost } }),
          },
        });
      }
      if (newStudentId) {
        // upsert : un instructeur qui vole comme pilote débité n'a pas
        // forcément de StudentProfile (voir POST /api/flights).
        await db.studentProfile.upsert({
          where: { userId: newStudentId },
          create: {
            userId: newStudentId,
            totalHours: duration,
            balanceCents: isBaptism ? 0 : -newTotalCost,
          },
          update: {
            totalHours: { increment: duration },
            ...(isBaptism ? {} : { balanceCents: { decrement: newTotalCost } }),
          },
        });
      }
    }

    // Débit reliée au vol (jamais pour un vol baptême : aucun débit à
    // l'origine) : même montant recalculé, ou déplacé vers le nouveau pilote.
    if (!isBaptism) {
      const notes = flightDebitNotes(newAircraft.registration, duration, newInstructionCost);
      if (!studentChanged) {
        if (existing.studentId) {
          await db.accountTransaction.updateMany({
            where: { flightLogId: id },
            data: { ...(costDelta !== 0 ? { amountCents: { decrement: costDelta } } : {}), notes },
          });
        }
      } else if (!newStudentId) {
        await db.accountTransaction.deleteMany({ where: { flightLogId: id } });
      } else {
        const transaction = await db.accountTransaction.findUnique({
          where: { flightLogId: id },
          select: { id: true },
        });
        if (transaction) {
          await db.accountTransaction.update({
            where: { id: transaction.id },
            data: { studentId: newStudentId, amountCents: -newTotalCost, date: departureTime, notes },
          });
        } else {
          await db.accountTransaction.create({
            data: {
              studentId: newStudentId,
              type: "FLIGHT_DEBIT",
              status: "CONFIRMED",
              amountCents: -newTotalCost,
              flightLogId: id,
              date: departureTime,
              notes,
              confirmedAt: new Date(),
              confirmedById: session.user.id,
            },
          });
        }
      }
    }

    // Heures et cycles de l'avion : d'un avion à l'autre s'il change.
    if (aircraftChanged) {
      await db.aircraft.update({
        where: { id: existing.aircraftId },
        data: {
          totalHours: { decrement: existing.duration },
          totalCycles: { decrement: existing.totalLandings },
        },
      });
      await db.aircraft.update({
        where: { id: newAircraftId },
        data: {
          totalHours: { increment: duration },
          totalCycles: { increment: newLandings },
        },
      });
    } else if (durationDelta !== 0 || landingsDelta !== 0) {
      await db.aircraft.update({
        where: { id: existing.aircraftId },
        data: {
          totalHours: { increment: durationDelta },
          totalCycles: { increment: landingsDelta },
        },
      });
    }

    return flight;
  });

  const aircraftToRecalc = aircraftChanged
    ? [existing.aircraftId, newAircraftId]
    : durationDelta !== 0 || landingsDelta !== 0
      ? [existing.aircraftId]
      : [];
  for (const aircraftId of aircraftToRecalc) {
    await recalcAircraftMaintenanceStatuses(prisma, aircraftId);
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
          // Vol baptême : aucun débit n'a jamais eu lieu pour ce vol (voir
          // POST .../complete), donc rien à recréditer ici — sans cette
          // garde, supprimer un vol baptême offrirait un crédit au pilote.
          ...(existing.isBaptism
            ? {}
            : { balanceCents: { increment: existing.aircraftCostCents + existing.instructionCostCents } }),
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
