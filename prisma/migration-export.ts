// Étape 1/2 de la migration SQLite → Postgres (voir le guide de mise en ligne).
//
// À exécuter EN LOCAL, tant que schema.prisma pointe encore vers SQLite
// (provider = "sqlite") et que .env DATABASE_URL pointe vers dev.db.
// Exporte l'intégralité des données réelles dans un fichier JSON unique,
// prêt pour prisma/migration-import.ts. N'écrit rien, ne supprime rien.
//
// Usage : npx tsx prisma/migration-export.ts

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

// Convertit les champs binaires (Bytes → Buffer côté Prisma) en base64
// pour qu'ils survivent au JSON. migration-import.ts fait l'inverse.
function toBase64(bytes: Uint8Array | null | undefined): string | null {
  if (!bytes) return null;
  return Buffer.from(bytes).toString("base64");
}

async function main() {
  console.log("Export des données depuis SQLite...");

  const users = await prisma.user.findMany();
  const studentProfiles = await prisma.studentProfile.findMany();
  const instructorProfiles = await prisma.instructorProfile.findMany();
  const aircraft = (await prisma.aircraft.findMany()).map((a) => ({
    ...a,
    photoData: toBase64(a.photoData),
  }));
  const trainingPrograms = await prisma.trainingProgram.findMany();
  const trainingPhases = await prisma.trainingPhase.findMany();
  const trainingExercises = await prisma.trainingExercise.findMany();
  const maintenanceRecords = await prisma.maintenanceRecord.findMany();
  const reservations = await prisma.reservation.findMany();
  const flightLogs = await prisma.flightLog.findMany();
  const flightStops = await prisma.flightStop.findMany();
  const kardexEntries = await prisma.kardexEntry.findMany();
  const accountTransactions = await prisma.accountTransaction.findMany();
  const enrollments = await prisma.enrollment.findMany();
  const trainingSessions = await prisma.trainingSession.findMany();
  const exerciseProgress = await prisma.exerciseProgress.findMany();
  // currentDocumentId est retiré ici et réappliqué par migration-import.ts
  // une fois les QualificationDocument insérés (référence circulaire).
  const qualifications = (await prisma.qualification.findMany()).map((q) => ({
    ...q,
    currentDocumentId: null,
    _originalCurrentDocumentId: q.currentDocumentId,
  }));
  const qualificationDocuments = (await prisma.qualificationDocument.findMany()).map((d) => ({
    ...d,
    fileData: toBase64(d.fileData),
  }));
  const schoolSettings = await prisma.schoolSettings.findMany();
  const announcements = await prisma.announcement.findMany();
  const announcementAttachments = (await prisma.announcementAttachment.findMany()).map((a) => ({
    ...a,
    fileData: toBase64(a.fileData),
  }));
  const schoolDocuments = (await prisma.schoolDocument.findMany()).map((d) => ({
    ...d,
    fileData: toBase64(d.fileData),
  }));

  const dump = {
    exportedAt: new Date().toISOString(),
    users,
    studentProfiles,
    instructorProfiles,
    aircraft,
    trainingPrograms,
    trainingPhases,
    trainingExercises,
    maintenanceRecords,
    reservations,
    flightLogs,
    flightStops,
    kardexEntries,
    accountTransactions,
    enrollments,
    trainingSessions,
    exerciseProgress,
    qualifications,
    qualificationDocuments,
    schoolSettings,
    announcements,
    announcementAttachments,
    schoolDocuments,
  };

  const outPath = path.join(__dirname, "migration-data.json");
  fs.writeFileSync(outPath, JSON.stringify(dump, null, 2));

  const counts = Object.fromEntries(
    Object.entries(dump).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).length])
  );
  console.log("Terminé :", outPath);
  console.log(counts);
  console.log(
    "\nCe fichier contient des données personnelles réelles (élèves, finances, licences). " +
      "Ne le committe jamais, supprime-le une fois la migration terminée et vérifiée."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
