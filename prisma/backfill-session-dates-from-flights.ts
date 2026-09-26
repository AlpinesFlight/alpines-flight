// Recale la date des séances de formation reliées à un vol sur la date de
// départ de ce vol (et celle des exercices notés dans ces séances).
//
// Contexte : avant ce correctif, la date d'une séance était celle saisie par
// le FI dans la fiche (par défaut "maintenant", donc le jour de la saisie et
// non celui du vol — ex. un vol du 23/05 saisi le 06/09 apparaissait au
// 06/09 dans l'onglet Séances et dans le livret). Désormais l'API impose la
// date du vol (voir POST/PATCH /api/enrollments/[id]/sessions) ; ce script
// aligne les séances déjà saisies. Idempotent.
//
// Usage : npx tsx prisma/backfill-session-dates-from-flights.ts          (simulation)
//         npx tsx prisma/backfill-session-dates-from-flights.ts --apply   (écrit)
//
// Exécuté le 2026-09-26 sur la base de production — 2 séances, 5 exercices
// (valeurs d'origine, pour pouvoir annuler à la main si besoin) :
//   cmtpq3lpt0001l804su6pak3y (Svenja Tarade)   date 2026-09-06T09:22Z -> 2026-05-23T17:00Z (vol du 23/05/2026 19:00)
//   cmu4ldwsc0001kx04k1jmhqh7 (Guillaume Milesi) date 2026-09-16T17:06Z -> 2026-09-16T07:00Z (vol du 16/09/2026 09:00)
// (les exercices de chaque séance portaient la même date que leur séance.)

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

const paris = (d: Date) =>
  d.toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

async function main() {
  const sessions = await prisma.trainingSession.findMany({
    where: { flightLogId: { not: null } },
    include: {
      flightLog: { select: { departureTime: true } },
      enrollment: { select: { student: { select: { firstName: true, lastName: true } } } },
      progress: { select: { id: true, date: true } },
    },
  });

  const todo = sessions.filter((s) => s.flightLog && s.date.getTime() !== s.flightLog.departureTime.getTime());
  console.log(`${sessions.length} séance(s) reliée(s) à un vol, ${todo.length} à recaler${apply ? "" : " (simulation)"}.`);

  for (const s of todo) {
    const target = s.flightLog!.departureTime;
    console.log(
      `- ${s.enrollment.student.firstName} ${s.enrollment.student.lastName} [${s.id}] : ` +
        `${paris(s.date)} (${s.date.toISOString()}) -> ${paris(target)} (${target.toISOString()}) — ${s.progress.length} exercice(s)`
    );
  }

  if (!apply || todo.length === 0) return;

  await prisma.$transaction(async (db) => {
    for (const s of todo) {
      const target = s.flightLog!.departureTime;
      await db.trainingSession.update({ where: { id: s.id }, data: { date: target } });
      await db.exerciseProgress.updateMany({ where: { sessionId: s.id }, data: { date: target } });
    }
  });
  console.log("Recalage appliqué.");
}

main().finally(() => prisma.$disconnect());
