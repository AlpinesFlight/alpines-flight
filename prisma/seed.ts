import {
  PrismaClient,
  Role,
  TransactionType,
  TransactionStatus,
  QualificationType,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { addDays } from "date-fns";
import { importTrainingPrograms } from "../src/lib/import-training-programs";

const prisma = new PrismaClient();

async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
}

// Crée un créneau de qualification déjà pourvu d'un document validé —
// pratique pour peupler des données de démo réalistes sans passer par le
// flux d'import + validation (qui reste testable séparément dans l'appli).
async function createValidatedQualification(
  userId: string,
  type: QualificationType,
  label: string,
  opts: { number?: string | null; expiresAt?: Date | null; reminderDaysBefore?: number },
  validatedById: string
) {
  const qualification = await prisma.qualification.create({
    data: { userId, type, label, reminderDaysBefore: opts.reminderDaysBefore ?? 45 },
  });
  const doc = await prisma.qualificationDocument.create({
    data: {
      qualificationId: qualification.id,
      number: opts.number ?? null,
      expiresAt: opts.expiresAt ?? null,
      status: "VALIDATED",
      uploadedById: validatedById,
      validatedById,
      validatedAt: new Date(),
    },
  });
  await prisma.qualification.update({
    where: { id: qualification.id },
    data: { currentDocumentId: doc.id },
  });
  return qualification;
}

async function main() {
  console.log("Nettoyage de la base...");
  await prisma.exerciseProgress.deleteMany();
  await prisma.trainingSession.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.trainingExercise.deleteMany();
  await prisma.trainingPhase.deleteMany();
  await prisma.trainingProgram.deleteMany();
  // Casse d'abord le pointeur "document courant" pour éviter un conflit de
  // clé étrangère entre Qualification et QualificationDocument (référence
  // mutuelle) avant de tout supprimer.
  await prisma.qualification.updateMany({ data: { currentDocumentId: null } });
  await prisma.qualificationDocument.deleteMany();
  await prisma.qualification.deleteMany();
  await prisma.accountTransaction.deleteMany();
  await prisma.flightLog.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.maintenanceRecord.deleteMany();
  await prisma.kardexEntry.deleteMany();
  await prisma.aircraft.deleteMany();
  await prisma.studentProfile.deleteMany();
  await prisma.instructorProfile.deleteMany();
  await prisma.user.deleteMany();

  // La flotte n'est plus pré-remplie : l'admin ajoute ses propres avions
  // depuis l'appli (Flotte → Nouvel avion).

  console.log("Création des utilisateurs...");

  // Gérant = Tom GREL, représentant DTO / responsable pédagogique / FI(A) / FE(A).
  // Tous droits, y compris finances — voir src/lib/permissions.ts.
  const admin = await prisma.user.create({
    data: {
      email: "tomgrel@alpinesflight.com",
      passwordHash: await hash("admin1234"),
      role: Role.GERANT,
      firstName: "Tom",
      lastName: "GREL",
      phone: "",
      instructorProfile: {
        create: { qualifications: "FI(A), FE(A), Responsable pédagogique", color: "#0C2448" },
      },
    },
  });

  const instructorsData = [
    {
      firstName: "Mathieu",
      lastName: "BRULE",
      email: "mathieu.brule@alpinesflight.fr",
      licence: "FRA.FCL.CA00184085",
      qualifications: "FI(A), Responsable pédagogique adjoint montagne",
      color: "#2C4D74",
      sep: null as string | null,
      fi: null as string | null,
      medicale: null as string | null,
    },
    {
      firstName: "Yassin",
      lastName: "BAKHTAOUI",
      email: "yassin.bakhtaoui@alpinesflight.fr",
      licence: "FRA.FCL.CA00323724",
      qualifications: "FI(A), Instructeur théorique",
      color: "#B4141E",
      sep: null,
      fi: null,
      medicale: null,
    },
    {
      firstName: "Jean-Yves",
      lastName: "MASSE",
      email: "jeanyves.masse@alpinesflight.fr",
      licence: "FRA.FCL.CA00019810",
      qualifications: "FI(A), Instructeur théorique et pratique montagne",
      color: "#D8641A",
      // Dates réelles issues du dossier DTO — déjà expirées : bon cas de
      // démonstration pour le suivi des licences/relances.
      sep: "2024-09-30",
      fi: "2025-04-30",
      medicale: "2025-02-28",
    },
  ];

  const instructors: { id: string; email: string; firstName: string }[] = [];
  for (const i of instructorsData) {
    const u = await prisma.user.create({
      data: {
        email: i.email,
        passwordHash: await hash("instruct1234"),
        role: Role.INSTRUCTOR,
        firstName: i.firstName,
        lastName: i.lastName,
        instructorProfile: {
          create: { qualifications: i.qualifications, color: i.color },
        },
      },
    });
    instructors.push(u);

    await createValidatedQualification(
      u.id,
      QualificationType.INSTRUCTOR_PRIV,
      "FI(A)",
      { number: i.licence, expiresAt: i.fi ? new Date(i.fi) : null, reminderDaysBefore: 45 },
      admin.id
    );
    await createValidatedQualification(
      u.id,
      QualificationType.CLASS_RATING,
      "SEP (terre)",
      { expiresAt: i.sep ? new Date(i.sep) : null, reminderDaysBefore: 45 },
      admin.id
    );
    await createValidatedQualification(
      u.id,
      QualificationType.MEDICAL,
      "Classe 2",
      { expiresAt: i.medicale ? new Date(i.medicale) : null, reminderDaysBefore: 30 },
      admin.id
    );
  }
  const [brule, bakhtaoui, masse] = instructors;

  // Qualifications de Tom GREL (admin) — données réelles du dossier DTO.
  await createValidatedQualification(
    admin.id,
    QualificationType.INSTRUCTOR_PRIV,
    "FI(A)",
    { number: "FRA.FCL.CA00352017", expiresAt: new Date("2026-08-31"), reminderDaysBefore: 45 },
    admin.id
  );
  await createValidatedQualification(
    admin.id,
    QualificationType.EXAMINER_PRIV,
    "FE(A)",
    { number: "FRA.FCL.CA00352017", expiresAt: new Date("2026-08-31"), reminderDaysBefore: 45 },
    admin.id
  );
  await createValidatedQualification(
    admin.id,
    QualificationType.CLASS_RATING,
    "SEP (terre)",
    { expiresAt: new Date("2025-11-30"), reminderDaysBefore: 45 },
    admin.id
  );
  await createValidatedQualification(
    admin.id,
    QualificationType.MEDICAL,
    "Classe 2",
    { expiresAt: new Date("2026-09-02"), reminderDaysBefore: 30 },
    admin.id
  );

  const studentsData = [
    { firstName: "Lucas", lastName: "Perrin", email: "lucas.perrin@example.com", licenseType: "Brevet de base", totalHours: 12.5 },
    { firstName: "Emma", lastName: "Girard", email: "emma.girard@example.com", licenseType: "PPL", totalHours: 38.2 },
    { firstName: "Nathan", lastName: "Fontaine", email: "nathan.fontaine@example.com", licenseType: "LAPL", totalHours: 5.0 },
    { firstName: "Léa", lastName: "Bonnet", email: "lea.bonnet@example.com", licenseType: "PPL", totalHours: 61.4 },
  ];

  const students = [];
  for (const s of studentsData) {
    const u = await prisma.user.create({
      data: {
        email: s.email,
        passwordHash: await hash("eleve1234"),
        role: Role.STUDENT,
        firstName: s.firstName,
        lastName: s.lastName,
        phone: "0600000000",
        studentProfile: {
          create: {
            licenseType: s.licenseType,
            totalHours: s.totalHours,
            balanceCents: 0,
            medicalExpiry: addDays(new Date(), 120),
          },
        },
      },
    });
    students.push(u);

    await createValidatedQualification(
      u.id,
      QualificationType.MEDICAL,
      "Classe 2",
      { expiresAt: addDays(new Date(), 120), reminderDaysBefore: 45 },
      admin.id
    );
  }
  const [lucas, emma, nathan, lea] = students;

  // Démo : le certificat médical de Nathan arrive bientôt à échéance (entre
  // dans la fenêtre de rappel) — corrige la date sur son document courant.
  const nathanMedical = await prisma.qualification.findFirst({
    where: { userId: nathan.id, type: "MEDICAL" },
  });
  if (nathanMedical?.currentDocumentId) {
    await prisma.qualificationDocument.update({
      where: { id: nathanMedical.currentDocumentId },
      data: { expiresAt: addDays(new Date(), 20) },
    });
  }

  // Démo : Léa vient de transmettre le renouvellement de sa médicale — en
  // attente de vérification par l'admin (workflow d'import + validation).
  const leaMedical = await prisma.qualification.findFirst({
    where: { userId: lea.id, type: "MEDICAL" },
  });
  if (leaMedical) {
    await prisma.qualificationDocument.create({
      data: {
        qualificationId: leaMedical.id,
        expiresAt: addDays(new Date(), 730),
        notes: "Photo transmise par l'élève.",
        status: "PENDING",
        uploadedById: lea.id,
      },
    });
  }

  console.log("Import des programmes de formation (fichiers DTO 4fly)...");
  try {
    const report = await importTrainingPrograms();
    console.log(
      `  → ${report.imported.length} programme(s) importé(s) depuis ${report.dir}`,
      report.errors.length ? `(${report.errors.length} erreur(s))` : ""
    );
    if (report.errors.length) console.log(report.errors);
  } catch (err) {
    console.log("  → Import des programmes de formation impossible :", err instanceof Error ? err.message : err);
    console.log("    (le dossier source n'est peut-être pas accessible sur cette machine — sans incidence sur le reste du seed)");
  }

  const programs = await prisma.trainingProgram.findMany();
  const pplProgram = programs.find((p) => p.code === "AF-0889-PRAT-PPL-A");
  const laplProgram = programs.find((p) => p.code === "AF-0889-PRAT-LAPL-A");

  if (pplProgram) {
    console.log("Création d'une inscription de démonstration (Lucas → PPL pratique)...");
    const enrollment = await prisma.enrollment.create({
      data: {
        studentId: lucas.id,
        programId: pplProgram.id,
        instructorId: admin.id,
        status: "IN_PROGRESS",
      },
    });

    const firstPhase = await prisma.trainingPhase.findFirst({
      where: { programId: pplProgram.id },
      orderBy: { order: "asc" },
      include: { exercises: { orderBy: { order: "asc" }, take: 4 } },
    });

    if (firstPhase && firstPhase.exercises.length > 0) {
      const sessionDate = addDays(new Date(), -7);
      const trainingSession = await prisma.trainingSession.create({
        data: {
          enrollmentId: enrollment.id,
          date: sessionDate,
          instructorId: admin.id,
          remarks: "Première séance : prise en main.",
        },
      });
      const levels = ["ASSIMILE", "ASSIMILE", "VU", "NON_VU"] as const;
      for (let i = 0; i < firstPhase.exercises.length; i++) {
        await prisma.exerciseProgress.create({
          data: {
            enrollmentId: enrollment.id,
            exerciseId: firstPhase.exercises[i].id,
            sessionId: trainingSession.id,
            level: levels[i] ?? "NON_VU",
            date: sessionDate,
            instructorId: admin.id,
          },
        });
      }
    }
  }

  if (laplProgram) {
    console.log("Création d'une inscription de démonstration (Nathan → LAPL pratique)...");
    await prisma.enrollment.create({
      data: {
        studentId: nathan.id,
        programId: laplProgram.id,
        instructorId: masse.id,
        status: "IN_PROGRESS",
      },
    });
  }

  console.log("Création des comptes pilotes (versements)...");

  // Lucas : versement confirmé + un en attente de vérification
  await prisma.accountTransaction.create({
    data: {
      studentId: lucas.id,
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.CONFIRMED,
      amountCents: 60000,
      method: "TRANSFER",
      reference: "VIR-LP-0421",
      confirmedAt: addDays(new Date(), -10),
      confirmedById: admin.id,
    },
  });
  await prisma.accountTransaction.create({
    data: {
      studentId: lucas.id,
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.PENDING,
      amountCents: 10000,
      method: "TRANSFER",
      reference: "VIR-LP-0512",
      notes: "Virement fait ce matin, en attente de réception.",
    },
  });

  // Emma : versement confirmé + écriture de reprise (solde négatif) + un en attente
  await prisma.accountTransaction.create({
    data: {
      studentId: emma.id,
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.CONFIRMED,
      amountCents: 50000,
      method: "TRANSFER",
      reference: "VIR-EG-0118",
      confirmedAt: addDays(new Date(), -60),
      confirmedById: admin.id,
    },
  });
  await prisma.accountTransaction.create({
    data: {
      studentId: emma.id,
      type: TransactionType.ADJUSTMENT,
      status: TransactionStatus.CONFIRMED,
      amountCents: -62000,
      notes: "Reprise du solde antérieur (ancien système)",
      confirmedAt: addDays(new Date(), -5),
      confirmedById: admin.id,
    },
  });
  await prisma.accountTransaction.create({
    data: {
      studentId: emma.id,
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.PENDING,
      amountCents: 30000,
      method: "TRANSFER",
      reference: "VIR-EG-0819",
    },
  });

  // Nathan : versement confirmé
  await prisma.accountTransaction.create({
    data: {
      studentId: nathan.id,
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.CONFIRMED,
      amountCents: 80000,
      method: "TRANSFER",
      reference: "VIR-NF-0302",
      confirmedAt: addDays(new Date(), -20),
      confirmedById: admin.id,
    },
  });

  // Léa : versement confirmé + reprise du solde antérieur
  await prisma.accountTransaction.create({
    data: {
      studentId: lea.id,
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.CONFIRMED,
      amountCents: 30000,
      method: "TRANSFER",
      reference: "VIR-LB-0207",
      confirmedAt: addDays(new Date(), -45),
      confirmedById: admin.id,
    },
  });
  await prisma.accountTransaction.create({
    data: {
      studentId: lea.id,
      type: TransactionType.ADJUSTMENT,
      status: TransactionStatus.CONFIRMED,
      amountCents: -15000,
      notes: "Reprise du solde antérieur (ancien système)",
      confirmedAt: addDays(new Date(), -5),
      confirmedById: admin.id,
    },
  });

  // Recalcule le solde de chaque élève à partir des transactions confirmées
  for (const s of students) {
    const agg = await prisma.accountTransaction.aggregate({
      where: { studentId: s.id, status: TransactionStatus.CONFIRMED },
      _sum: { amountCents: true },
    });
    await prisma.studentProfile.update({
      where: { userId: s.id },
      data: { balanceCents: agg._sum.amountCents ?? 0 },
    });
  }

  console.log("Terminé.");
  console.log({ admin: admin.email, instructors: [brule.email, bakhtaoui.email, masse.email] });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
