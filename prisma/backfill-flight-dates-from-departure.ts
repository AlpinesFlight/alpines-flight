// Recale la date du carnet (FlightLog.date — affichée sur la page Vols, base
// du tri et des filtres de période) sur l'heure de départ des vols dont elle
// tombe un AUTRE JOUR que le départ.
//
// Contexte : la correction d'un vol (PATCH /api/flights/[id]) mettait à jour
// departureTime mais jamais date — un vol ramené du 4 au 3 septembre restait
// affiché au 4. Désormais la date suit le départ à chaque correction ; ce
// script rattrape les vols déjà corrigés avant. On ne touche volontairement
// qu'aux écarts d'un jour entier : pour un vol clôturé depuis le planning, date
// = début de créneau réservé, départ = heure réelle, qui diffèrent de quelques
// minutes sans que ce soit une erreur. Idempotent.
//
// Usage : npx tsx prisma/backfill-flight-dates-from-departure.ts          (simulation)
//         npx tsx prisma/backfill-flight-dates-from-departure.ts --apply   (écrit)
//
// Exécuté le 2026-09-26 sur la base de production — 1 vol sur 22
// (valeur d'origine, pour pouvoir annuler à la main si besoin) :
//   cmtnf7hwg0003ih045pe5d08w (Svenja Tarade, F-BOKF)
//   date 2026-09-04T16:00Z (04/09 18:00) -> 2026-09-03T16:00Z (03/09 18:00)

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

const parisDay = (d: Date) => d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
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
  const flights = await prisma.flightLog.findMany({
    select: {
      id: true,
      date: true,
      departureTime: true,
      aircraft: { select: { registration: true } },
      student: { select: { firstName: true, lastName: true } },
    },
  });
  const todo = flights.filter((f) => parisDay(f.date) !== parisDay(f.departureTime));
  console.log(`${flights.length} vol(s), ${todo.length} à recaler${apply ? "" : " (simulation)"}.`);

  for (const f of todo) {
    console.log(
      `- ${f.student ? `${f.student.firstName} ${f.student.lastName}` : "sans pilote"}, ${f.aircraft.registration} [${f.id}] : ` +
        `${paris(f.date)} (${f.date.toISOString()}) -> ${paris(f.departureTime)} (${f.departureTime.toISOString()})`
    );
  }

  if (!apply || todo.length === 0) return;

  await prisma.$transaction(
    todo.map((f) => prisma.flightLog.update({ where: { id: f.id }, data: { date: f.departureTime } }))
  );
  console.log("Recalage appliqué.");
}

main().finally(() => prisma.$disconnect());
