// Étape 2/2 de la migration SQLite → Postgres (voir le guide de mise en ligne).
//
// À exécuter UNE FOIS que :
//   1. schema.prisma a été basculé sur provider = "postgresql"
//   2. .env DATABASE_URL pointe vers la nouvelle base Postgres (vide)
//   3. `npx prisma migrate deploy` a été lancé contre cette base (crée les
//      tables, sans aucune donnée)
//   4. prisma/migration-data.json existe (généré par migration-export.ts)
//
// Insère les données dans l'ordre qui respecte les clés étrangères. Conçu
// pour tourner sur une base neuve : si une table contient déjà des lignes,
// arrête-toi et vérifie avant de relancer (pas fait pour être rejoué
// plusieurs fois sur les mêmes données).
//
// Usage : npx tsx prisma/migration-import.ts

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

function fromBase64(b64: string | null | undefined): Buffer | null {
  if (!b64) return null;
  return Buffer.from(b64, "base64");
}

// Convertit récursivement toute valeur qui ressemble à une date ISO
// (les champs DateTime? de Prisma) en objet Date — JSON.parse ne le fait
// pas tout seul. Les champs Json (notationScale, objectifs, contenu) sont
// laissés tels quels : ce ne sont pas des dates, createMany les accepte
// directement.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
function reviveDates<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(reviveDates) as unknown as T;
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = typeof v === "string" && ISO_DATE.test(v) ? new Date(v) : reviveDates(v);
    }
    return out as T;
  }
  return obj;
}

async function main() {
  const dataPath = path.join(__dirname, "migration-data.json");
  if (!fs.existsSync(dataPath)) {
    throw new Error(`${dataPath} introuvable — lance d'abord migration-export.ts.`);
  }
  const raw = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  // any assumé : les enregistrements viennent d'un aller-retour JSON depuis
  // findMany() sur ces mêmes modèles (voir migration-export.ts) — la forme
  // est correcte à l'exécution, mais TypeScript ne peut pas le vérifier à
  // travers reviveDates(). Vérifié à la main champ par champ ci-dessous.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dump: Record<string, any[]> = reviveDates(raw);

  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    throw new Error(
      `Cette base contient déjà ${existingUsers} utilisateur(s) — arrêt par sécurité pour ne pas dupliquer. ` +
        "Vérifie que tu pointes bien vers une base Postgres neuve avant de relancer."
    );
  }

  console.log("Import vers Postgres...");

  await prisma.user.createMany({ data: dump.users });
  await prisma.studentProfile.createMany({ data: dump.studentProfiles });
  await prisma.instructorProfile.createMany({ data: dump.instructorProfiles });
  await prisma.aircraft.createMany({
    data: dump.aircraft.map((a) => ({ ...a, photoData: fromBase64(a.photoData as string | null) })),
  });
  await prisma.trainingProgram.createMany({ data: dump.trainingPrograms });
  await prisma.trainingPhase.createMany({ data: dump.trainingPhases });
  await prisma.trainingExercise.createMany({ data: dump.trainingExercises });
  await prisma.maintenanceRecord.createMany({ data: dump.maintenanceRecords });
  await prisma.reservation.createMany({ data: dump.reservations });
  await prisma.flightLog.createMany({ data: dump.flightLogs });
  await prisma.flightStop.createMany({ data: dump.flightStops });
  await prisma.kardexEntry.createMany({ data: dump.kardexEntries });
  await prisma.accountTransaction.createMany({ data: dump.accountTransactions });
  await prisma.enrollment.createMany({ data: dump.enrollments });
  await prisma.trainingSession.createMany({ data: dump.trainingSessions });
  await prisma.exerciseProgress.createMany({ data: dump.exerciseProgress });

  // Qualification insérées sans currentDocumentId (référence circulaire —
  // voir migration-export.ts), réappliqué juste après.
  await prisma.qualification.createMany({
    data: dump.qualifications.map(({ _originalCurrentDocumentId, ...q }) => q),
  });
  await prisma.qualificationDocument.createMany({
    data: dump.qualificationDocuments.map((d) => ({
      ...d,
      fileData: fromBase64(d.fileData as string | null),
    })),
  });
  for (const q of dump.qualifications) {
    if (q._originalCurrentDocumentId) {
      await prisma.qualification.update({
        where: { id: q.id as string },
        data: { currentDocumentId: q._originalCurrentDocumentId as string },
      });
    }
  }

  await prisma.schoolSettings.createMany({ data: dump.schoolSettings });
  await prisma.announcement.createMany({ data: dump.announcements });
  await prisma.announcementAttachment.createMany({
    data: dump.announcementAttachments.map((a) => ({
      ...a,
      fileData: fromBase64(a.fileData as string | null),
    })),
  });
  await prisma.schoolDocument.createMany({
    data: dump.schoolDocuments.map((d) => ({ ...d, fileData: fromBase64(d.fileData as string | null) })),
  });

  console.log("Import terminé. Vérifie les comptages ci-dessous par rapport à ceux affichés par migration-export.ts :");
  console.log({
    users: await prisma.user.count(),
    aircraft: await prisma.aircraft.count(),
    reservations: await prisma.reservation.count(),
    flightLogs: await prisma.flightLog.count(),
    accountTransactions: await prisma.accountTransaction.count(),
    qualifications: await prisma.qualification.count(),
    qualificationDocuments: await prisma.qualificationDocument.count(),
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
