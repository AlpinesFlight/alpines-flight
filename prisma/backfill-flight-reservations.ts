// Rattrapage (2026-10-23) : crée le créneau planning des vols saisis après coup
// avant que POST /api/flights ne le fasse lui-même — une réservation COMPLETED
// marquée fromFlightEntry, sans aucun e-mail, reliée au vol. Idempotent : ne
// traite que les vols qui n'ont pas encore de réservation.
//
// Le type n'était pas enregistré sur le vol (FlightLog n'a pas de champ type) :
// il est déduit comme le formulaire « Ajouter un vol antérieur » l'aurait
// produit — instruction facturée ou formation → Instruction ; instructeur noté
// sans instruction facturée → Solo supervisé ; pas d'instructeur → Location
// (Maintenance s'il n'y a pas de pilote non plus). Corrigeable ensuite depuis
// le planning.
//
// Usage : npx tsx prisma/backfill-flight-reservations.ts          (à blanc)
//         npx tsx prisma/backfill-flight-reservations.ts --apply  (écrit)
process.loadEnvFile(".env");
import { PrismaClient, ReservationType } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

function inferType(f: { trainingProgramId: string | null; instructionCostCents: number; instructorId: string | null; studentId: string | null }): ReservationType {
  if (f.trainingProgramId || f.instructionCostCents > 0) return "INSTRUCTION";
  if (f.instructorId) return "SOLO";
  if (f.studentId) return "LOCATION";
  return "MAINTENANCE";
}

async function main() {
  const flights = await prisma.flightLog.findMany({
    where: { reservationId: null },
    orderBy: { departureTime: "asc" },
    select: {
      id: true, aircraftId: true, studentId: true, instructorId: true, trainingProgramId: true,
      instructionCostCents: true, isBaptism: true, departureTime: true, arrivalTime: true,
      aircraft: { select: { registration: true } },
    },
  });

  const counts: Record<string, number> = {};
  for (const f of flights) {
    const type = inferType(f);
    counts[type] = (counts[type] ?? 0) + 1;
    console.log(`${apply ? "créé " : "à créer"}  ${f.departureTime.toISOString().slice(0, 16)}Z  ${f.aircraft.registration}  ${type}`);
    if (!apply) continue;
    await prisma.$transaction(async (db) => {
      const reservation = await db.reservation.create({
        data: {
          aircraftId: f.aircraftId,
          studentId: f.studentId,
          instructorId: f.instructorId,
          trainingProgramId: f.trainingProgramId,
          type,
          status: "COMPLETED",
          startTime: f.departureTime,
          endTime: f.arrivalTime,
          isBaptism: f.isBaptism,
          notes: "Vol saisi après coup (page Vols)",
          fromFlightEntry: true,
        },
      });
      await db.flightLog.update({ where: { id: f.id }, data: { reservationId: reservation.id } });
    });
  }
  console.log(`\n${flights.length} vol(s) sans réservation`, counts, apply ? "— créneaux créés" : "— à blanc, rien d'écrit (--apply pour écrire)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
