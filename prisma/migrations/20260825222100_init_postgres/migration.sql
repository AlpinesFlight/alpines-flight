-- CreateEnum
CREATE TYPE "Role" AS ENUM ('GERANT', 'ADMIN', 'INSTRUCTOR', 'STUDENT');

-- CreateEnum
CREATE TYPE "AircraftStatus" AS ENUM ('AVAILABLE', 'MAINTENANCE', 'GROUNDED', 'RETIRED');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('HOURLY', 'CALENDAR', 'CYCLES');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('UPCOMING', 'DUE', 'OVERDUE', 'DONE');

-- CreateEnum
CREATE TYPE "KardexCategory" AS ENUM ('VISITE', 'REPARATION', 'CONSIGNE_NAVIGABILITE', 'PIECE_REMPLACEE', 'AUTRE');

-- CreateEnum
CREATE TYPE "ReservationType" AS ENUM ('INSTRUCTION', 'SOLO', 'LOCATION', 'MAINTENANCE', 'DISCOVERY');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('CONFIRMED', 'IN_FLIGHT', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "FuelCard" AS ENUM ('BP', 'TOTAL', 'BADGE_TALLARD');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('AVGAS_100LL', 'SP98');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'FLIGHT_DEBIT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'TRANSFER', 'CASH', 'CHECK');

-- CreateEnum
CREATE TYPE "QualificationType" AS ENUM ('LICENSE', 'MEDICAL', 'CLASS_RATING', 'VARIANT', 'ADDITIONAL', 'INSTRUCTOR_PRIV', 'EXAMINER_PRIV', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'VALIDATED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExerciseType" AS ENUM ('SOL', 'DC', 'SOLO', 'TEST', 'DC_SOLO');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ProgressLevel" AS ENUM ('NON_VU', 'VU', 'ASSIMILE', 'NIVEAU_CIBLE');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('ALL', 'FI_ONLY');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "licenseType" TEXT,
    "licenseNumber" TEXT,
    "medicalExpiry" TIMESTAMP(3),
    "totalHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "isPilot" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstructorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "qualifications" TEXT,
    "hourlyRateCents" INTEGER,
    "color" TEXT NOT NULL DEFAULT '#0C2448',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstructorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aircraft" (
    "id" TEXT NOT NULL,
    "registration" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "hourlyRateCents" INTEGER NOT NULL,
    "status" "AircraftStatus" NOT NULL DEFAULT 'AVAILABLE',
    "totalHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCycles" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#F04818',
    "notes" TEXT,
    "photoData" BYTEA,
    "photoMimeType" TEXT,
    "photoFileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Aircraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceRecord" (
    "id" TEXT NOT NULL,
    "aircraftId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "MaintenanceType" NOT NULL,
    "dueAtHours" DOUBLE PRECISION,
    "dueAtDate" TIMESTAMP(3),
    "dueAtCycles" INTEGER,
    "alertBefore" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'UPCOMING',
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KardexEntry" (
    "id" TEXT NOT NULL,
    "aircraftId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "hoursAt" DOUBLE PRECISION,
    "cyclesAt" INTEGER,
    "category" "KardexCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "performedBy" TEXT,
    "reference" TEXT,
    "maintenanceRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "KardexEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "aircraftId" TEXT NOT NULL,
    "studentId" TEXT,
    "instructorId" TEXT,
    "trainingProgramId" TEXT,
    "type" "ReservationType" NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "actualDepartureTime" TIMESTAMP(3),
    "notes" TEXT,
    "clientName" TEXT,
    "clientPhone" TEXT,
    "clientEmail" TEXT,
    "priceCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlightLog" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT,
    "aircraftId" TEXT NOT NULL,
    "studentId" TEXT,
    "instructorId" TEXT,
    "trainingProgramId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "departureTime" TIMESTAMP(3) NOT NULL,
    "arrivalTime" TIMESTAMP(3) NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL,
    "totalLandings" INTEGER NOT NULL DEFAULT 0,
    "aircraftCostCents" INTEGER NOT NULL DEFAULT 0,
    "instructionCostCents" INTEGER NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fuelRefillDone" BOOLEAN NOT NULL DEFAULT false,
    "fuelCard" "FuelCard",
    "fuelLiters" DOUBLE PRECISION,
    "fuelType" "FuelType",
    "fuelAirfield" TEXT,

    CONSTRAINT "FlightLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlightStop" (
    "id" TEXT NOT NULL,
    "flightLogId" TEXT NOT NULL,
    "airfield" TEXT NOT NULL,
    "touchAndGo" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "FlightStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountTransaction" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'CONFIRMED',
    "amountCents" INTEGER NOT NULL,
    "method" "PaymentMethod",
    "reference" TEXT,
    "flightLogId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,

    CONSTRAINT "AccountTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Qualification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "QualificationType" NOT NULL,
    "label" TEXT NOT NULL,
    "reminderDaysBefore" INTEGER NOT NULL DEFAULT 45,
    "lastReminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "currentDocumentId" TEXT,

    CONSTRAINT "Qualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualificationDocument" (
    "id" TEXT NOT NULL,
    "qualificationId" TEXT NOT NULL,
    "number" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "fileName" TEXT,
    "fileMimeType" TEXT,
    "fileSize" INTEGER,
    "fileData" BYTEA,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,
    "validatedAt" TIMESTAMP(3),
    "validatedById" TEXT,

    CONSTRAINT "QualificationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingProgram" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "modality" TEXT,
    "referenceReglementaire" TEXT,
    "sanction" TEXT,
    "volumeLabel" TEXT,
    "notationScale" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sourceFile" TEXT,
    "importedAt" TIMESTAMP(3),
    "instructionRateCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingPhase" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "objectifGeneral" TEXT,

    CONSTRAINT "TrainingPhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingExercise" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "numero" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,
    "type" "ExerciseType" NOT NULL,
    "objectifs" JSONB,
    "contenu" JSONB,
    "criteresValidation" TEXT,
    "dureeIndicativeH" DOUBLE PRECISION,
    "bloquantPour" TEXT,
    "note" TEXT,

    CONSTRAINT "TrainingExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "instructorId" TEXT,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "targetExamDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingSession" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "instructorId" TEXT NOT NULL,
    "aircraftId" TEXT,
    "flightLogId" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseProgress" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "sessionId" TEXT,
    "level" "ProgressLevel" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "instructorId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExerciseProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "ibanHolder" TEXT,
    "iban" TEXT,
    "bic" TEXT,
    "bankName" TEXT,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "SchoolSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementAttachment" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileMimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileData" BYTEA NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'ALL',
    "fileName" TEXT NOT NULL,
    "fileMimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileData" BYTEA NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "SchoolDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_userId_key" ON "StudentProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "InstructorProfile_userId_key" ON "InstructorProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Aircraft_registration_key" ON "Aircraft"("registration");

-- CreateIndex
CREATE UNIQUE INDEX "FlightLog_reservationId_key" ON "FlightLog"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountTransaction_flightLogId_key" ON "AccountTransaction"("flightLogId");

-- CreateIndex
CREATE UNIQUE INDEX "Qualification_currentDocumentId_key" ON "Qualification"("currentDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingProgram_code_key" ON "TrainingProgram"("code");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingPhase_programId_code_key" ON "TrainingPhase"("programId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingExercise_phaseId_numero_key" ON "TrainingExercise"("phaseId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_studentId_programId_key" ON "Enrollment"("studentId", "programId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingSession_flightLogId_key" ON "TrainingSession"("flightLogId");

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructorProfile" ADD CONSTRAINT "InstructorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KardexEntry" ADD CONSTRAINT "KardexEntry_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KardexEntry" ADD CONSTRAINT "KardexEntry_maintenanceRecordId_fkey" FOREIGN KEY ("maintenanceRecordId") REFERENCES "MaintenanceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KardexEntry" ADD CONSTRAINT "KardexEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_trainingProgramId_fkey" FOREIGN KEY ("trainingProgramId") REFERENCES "TrainingProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlightLog" ADD CONSTRAINT "FlightLog_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlightLog" ADD CONSTRAINT "FlightLog_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlightLog" ADD CONSTRAINT "FlightLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlightLog" ADD CONSTRAINT "FlightLog_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlightLog" ADD CONSTRAINT "FlightLog_trainingProgramId_fkey" FOREIGN KEY ("trainingProgramId") REFERENCES "TrainingProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlightStop" ADD CONSTRAINT "FlightStop_flightLogId_fkey" FOREIGN KEY ("flightLogId") REFERENCES "FlightLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountTransaction" ADD CONSTRAINT "AccountTransaction_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountTransaction" ADD CONSTRAINT "AccountTransaction_flightLogId_fkey" FOREIGN KEY ("flightLogId") REFERENCES "FlightLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountTransaction" ADD CONSTRAINT "AccountTransaction_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Qualification" ADD CONSTRAINT "Qualification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Qualification" ADD CONSTRAINT "Qualification_currentDocumentId_fkey" FOREIGN KEY ("currentDocumentId") REFERENCES "QualificationDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualificationDocument" ADD CONSTRAINT "QualificationDocument_qualificationId_fkey" FOREIGN KEY ("qualificationId") REFERENCES "Qualification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualificationDocument" ADD CONSTRAINT "QualificationDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualificationDocument" ADD CONSTRAINT "QualificationDocument_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPhase" ADD CONSTRAINT "TrainingPhase_programId_fkey" FOREIGN KEY ("programId") REFERENCES "TrainingProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingExercise" ADD CONSTRAINT "TrainingExercise_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "TrainingPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "TrainingProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_flightLogId_fkey" FOREIGN KEY ("flightLogId") REFERENCES "FlightLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseProgress" ADD CONSTRAINT "ExerciseProgress_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseProgress" ADD CONSTRAINT "ExerciseProgress_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "TrainingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseProgress" ADD CONSTRAINT "ExerciseProgress_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseProgress" ADD CONSTRAINT "ExerciseProgress_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolSettings" ADD CONSTRAINT "SchoolSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementAttachment" ADD CONSTRAINT "AnnouncementAttachment_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolDocument" ADD CONSTRAINT "SchoolDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
