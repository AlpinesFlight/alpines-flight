import type { Prisma, PrismaClient } from "@prisma/client";
import { formatHoursMinutes } from "@/lib/format";

// Crédit instructeur : à chaque vol dont l'instruction est facturée à un
// pilote (débit FLIGHT_DEBIT), l'instructeur du vol reçoit sur son propre
// compte pilote sa part de ce montant d'instruction — lui-même fonction de
// la formation choisie (TrainingProgram.instructionRateCents, voir
// /api/reservations/[id]/complete). La part (InstructorProfile.
// instructionSharePct, 100 % par défaut) est réglée par le Gérant ; celle
// appliquée est figée sur le vol (FlightLog.instructorSharePct), pour qu'une
// correction ultérieure du vol ne recalcule pas à un autre taux.
//
// Le crédit est un mouvement INSTRUCTION_CREDIT relié au vol par
// AccountTransaction.instructorFlightLogId. Comme le débit du pilote, il
// suit les corrections du vol (/api/flights/[id]) et disparaît avec lui.

type Db = Prisma.TransactionClient | PrismaClient;

export function instructorCreditCents(instructionCostCents: number, sharePct: number | null | undefined): number {
  if (!sharePct || sharePct <= 0 || instructionCostCents <= 0) return 0;
  return Math.round((instructionCostCents * sharePct) / 100);
}

// Part actuelle de l'instructeur — pas de profil instructeur, pas de part.
export async function currentInstructorSharePct(db: Db, instructorId: string): Promise<number> {
  const profile = await db.instructorProfile.findUnique({
    where: { userId: instructorId },
    select: { instructionSharePct: true },
  });
  return profile?.instructionSharePct ?? 0;
}

function creditNotes(pilotName: string | null, duration: number, sharePct: number) {
  return `Instruction${pilotName ? ` ${pilotName}` : ""} — ${formatHoursMinutes(duration)} (part ${sharePct} %)`;
}

interface CreditTarget {
  flightId: string;
  instructorId: string;
  amountCents: number;
  sharePct: number;
  // Date de l'opération = départ du vol, comme le débit du pilote.
  date: Date;
  duration: number;
  pilotName: string | null;
  confirmedById: string;
}

export async function createInstructorCredit(db: Prisma.TransactionClient, c: CreditTarget) {
  await db.accountTransaction.create({
    data: {
      studentId: c.instructorId,
      type: "INSTRUCTION_CREDIT",
      status: "CONFIRMED",
      amountCents: c.amountCents,
      instructorFlightLogId: c.flightId,
      date: c.date,
      notes: creditNotes(c.pilotName, c.duration, c.sharePct),
      confirmedAt: new Date(),
      confirmedById: c.confirmedById,
    },
  });
  // upsert : un instructeur n'a pas forcément encore de compte pilote
  // (StudentProfile) — créé à la volée, comme pour un FI débité en pilote.
  await db.studentProfile.upsert({
    where: { userId: c.instructorId },
    create: { userId: c.instructorId, balanceCents: c.amountCents },
    update: { balanceCents: { increment: c.amountCents } },
  });
}

// Retire le crédit instructeur d'un vol (et son effet sur le solde).
export async function removeInstructorCredit(db: Prisma.TransactionClient, flightId: string) {
  const credit = await db.accountTransaction.findUnique({ where: { instructorFlightLogId: flightId } });
  if (!credit) return;
  if (credit.status === "CONFIRMED") {
    await db.studentProfile.updateMany({
      where: { userId: credit.studentId },
      data: { balanceCents: { decrement: credit.amountCents } },
    });
  }
  await db.accountTransaction.delete({ where: { id: credit.id } });
}

// Après correction d'un vol (/api/flights/[id]) : met le crédit en accord
// avec le vol corrigé. Montant inchangé côté instructeur sauf écart entre
// l'ancien et le nouveau crédit calculé — appliqué en delta, pour ne pas
// écraser une retouche faite à la main sur la ligne du compte pilote (même
// principe que le débit du pilote). Changement d'instructeur : le crédit
// passe entièrement au nouveau.
export async function syncInstructorCredit(
  db: Prisma.TransactionClient,
  p: {
    flightId: string;
    instructorId: string | null;
    instructorChanged: boolean;
    oldCreditCents: number;
    newCreditCents: number;
    sharePct: number;
    date: Date;
    duration: number;
    pilotName: string | null;
    confirmedById: string;
  }
) {
  const credit = await db.accountTransaction.findUnique({ where: { instructorFlightLogId: p.flightId } });
  const target = (instructorId: string): CreditTarget => ({
    flightId: p.flightId,
    instructorId,
    amountCents: p.newCreditCents,
    sharePct: p.sharePct,
    date: p.date,
    duration: p.duration,
    pilotName: p.pilotName,
    confirmedById: p.confirmedById,
  });

  if (credit && (p.instructorChanged || p.newCreditCents === 0 || credit.studentId !== p.instructorId)) {
    await removeInstructorCredit(db, p.flightId);
    if (p.instructorId && p.newCreditCents > 0) await createInstructorCredit(db, target(p.instructorId));
    return;
  }
  if (credit) {
    const delta = p.newCreditCents - p.oldCreditCents;
    await db.accountTransaction.update({
      where: { id: credit.id },
      data: {
        ...(delta !== 0 ? { amountCents: { increment: delta } } : {}),
        date: p.date,
        notes: creditNotes(p.pilotName, p.duration, p.sharePct),
      },
    });
    if (delta !== 0 && credit.status === "CONFIRMED") {
      await db.studentProfile.updateMany({
        where: { userId: credit.studentId },
        data: { balanceCents: { increment: delta } },
      });
    }
    return;
  }
  if (p.instructorId && p.newCreditCents > 0) await createInstructorCredit(db, target(p.instructorId));
}
