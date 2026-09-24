// Correctif immédiat après import-fbokf-kardex.ts : (1) supprime les 8
// entrées Kardex que je viens de créer en double d'un import Excel déjà
// fait le 2026-09-08 (feature "Import du Kardex depuis Excel", commit
// aee5b4d) que je n'avais pas vérifié avant d'écrire les miennes ; (2)
// ajoute l'échéance EU 2005-0027(A) oubliée (elle a bien un intervalle/
// butée dans le Statut malgré une colonne "Sta" vide, contrairement à ce
// que j'avais supposé).
import { prisma } from "../src/lib/prisma";

async function main() {
  const aircraft = await prisma.aircraft.findFirstOrThrow({ where: { registration: "F-BOKF" } });

  const toDelete = await prisma.kardexEntry.findMany({
    where: {
      aircraftId: aircraft.id,
      title: {
        in: [
          "Criques culasses",
          "Filtre pompe à carburant",
          "Throttle and mixture control arms",
          "Pesée",
          "Compensation compas",
          "Hélice EVRA D11-28-7C",
          "Carburateur MA3SPS",
          "Générateur DELCO 1101890",
        ],
      },
      createdAt: { gte: new Date("2026-09-24T18:00:00.000Z") },
    },
  });
  console.log(`Suppression de ${toDelete.length} doublons Kardex (attendu: 8) :`);
  for (const d of toDelete) console.log(`  - ${d.title} (${d.id})`);
  await prisma.kardexEntry.deleteMany({ where: { id: { in: toDelete.map((d) => d.id) } } });

  const gerant = await prisma.user.findFirstOrThrow({ where: { role: "GERANT" } });
  const already = await prisma.maintenanceRecord.findFirst({ where: { aircraftId: aircraft.id, reference: "EU 2005-0027(A)" } });
  if (!already) {
    await prisma.maintenanceRecord.create({
      data: {
        aircraftId: aircraft.id,
        label: "Empennage — inspection/modification ferrures d'attache",
        reference: "EU 2005-0027(A)",
        zone: "Cellule",
        type: "CALENDAR",
        dueAtDate: new Date("2029-04-17"),
        alertBefore: 30,
        intervalDays: 1096,
      },
    });
    console.log("Échéance EU 2005-0027(A) ajoutée.");
  }

  const { recalcAircraftMaintenanceStatuses } = await import("../src/lib/maintenance");
  await recalcAircraftMaintenanceStatuses(prisma, aircraft.id);
  console.log("Statuts recalculés.");
}

main()
  .catch((e) => {
    console.error("FIX ERROR", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
