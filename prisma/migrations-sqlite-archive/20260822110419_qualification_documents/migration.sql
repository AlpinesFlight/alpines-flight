-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StudentProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "licenseType" TEXT,
    "licenseNumber" TEXT,
    "medicalExpiry" DATETIME,
    "totalHours" REAL NOT NULL DEFAULT 0,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InstructorProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "qualifications" TEXT,
    "hourlyRateCents" INTEGER,
    "color" TEXT NOT NULL DEFAULT '#0C2448',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InstructorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Aircraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "registration" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "hourlyRateCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "totalHours" REAL NOT NULL DEFAULT 0,
    "totalCycles" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#F04818',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MaintenanceRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aircraftId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dueAtHours" REAL,
    "dueAtDate" DATETIME,
    "dueAtCycles" INTEGER,
    "alertBefore" REAL NOT NULL DEFAULT 10,
    "status" TEXT NOT NULL DEFAULT 'UPCOMING',
    "completedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MaintenanceRecord_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KardexEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aircraftId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "hoursAt" REAL,
    "cyclesAt" INTEGER,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "performedBy" TEXT,
    "reference" TEXT,
    "maintenanceRecordId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    CONSTRAINT "KardexEntry_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KardexEntry_maintenanceRecordId_fkey" FOREIGN KEY ("maintenanceRecordId") REFERENCES "MaintenanceRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "KardexEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aircraftId" TEXT NOT NULL,
    "studentId" TEXT,
    "instructorId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "actualDepartureTime" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Reservation_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reservation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Reservation_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FlightLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reservationId" TEXT,
    "aircraftId" TEXT NOT NULL,
    "studentId" TEXT,
    "instructorId" TEXT,
    "date" DATETIME NOT NULL,
    "departureTime" DATETIME NOT NULL,
    "arrivalTime" DATETIME NOT NULL,
    "duration" REAL NOT NULL,
    "totalLandings" INTEGER NOT NULL DEFAULT 0,
    "aircraftCostCents" INTEGER NOT NULL DEFAULT 0,
    "instructionCostCents" INTEGER NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fuelRefillDone" BOOLEAN NOT NULL DEFAULT false,
    "fuelCard" TEXT,
    "fuelLiters" REAL,
    "fuelType" TEXT,
    "fuelAirfield" TEXT,
    CONSTRAINT "FlightLog_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FlightLog_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FlightLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FlightLog_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FlightStop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "flightLogId" TEXT NOT NULL,
    "airfield" TEXT NOT NULL,
    "touchAndGo" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "FlightStop_flightLogId_fkey" FOREIGN KEY ("flightLogId") REFERENCES "FlightLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "amountCents" INTEGER NOT NULL,
    "method" TEXT,
    "reference" TEXT,
    "flightLogId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    "confirmedById" TEXT,
    CONSTRAINT "AccountTransaction_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccountTransaction_flightLogId_fkey" FOREIGN KEY ("flightLogId") REFERENCES "FlightLog" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AccountTransaction_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Qualification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "reminderDaysBefore" INTEGER NOT NULL DEFAULT 45,
    "lastReminderSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "currentDocumentId" TEXT,
    CONSTRAINT "Qualification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Qualification_currentDocumentId_fkey" FOREIGN KEY ("currentDocumentId") REFERENCES "QualificationDocument" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualificationDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "qualificationId" TEXT NOT NULL,
    "number" TEXT,
    "issuedAt" DATETIME,
    "expiresAt" DATETIME,
    "notes" TEXT,
    "fileName" TEXT,
    "fileMimeType" TEXT,
    "fileSize" INTEGER,
    "fileData" BLOB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,
    "validatedAt" DATETIME,
    "validatedById" TEXT,
    CONSTRAINT "QualificationDocument_qualificationId_fkey" FOREIGN KEY ("qualificationId") REFERENCES "Qualification" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QualificationDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "QualificationDocument_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrainingProgram" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "importedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TrainingPhase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "programId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "objectifGeneral" TEXT,
    CONSTRAINT "TrainingPhase_programId_fkey" FOREIGN KEY ("programId") REFERENCES "TrainingProgram" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrainingExercise" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phaseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "numero" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "objectifs" JSONB,
    "contenu" JSONB,
    "criteresValidation" TEXT,
    "dureeIndicativeH" REAL,
    "bloquantPour" TEXT,
    "note" TEXT,
    CONSTRAINT "TrainingExercise_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "TrainingPhase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "instructorId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "targetExamDate" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Enrollment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "TrainingProgram" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Enrollment_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrainingSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "enrollmentId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "instructorId" TEXT NOT NULL,
    "aircraftId" TEXT,
    "flightLogId" TEXT,
    "remarks" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TrainingSession_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrainingSession_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TrainingSession_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TrainingSession_flightLogId_fkey" FOREIGN KEY ("flightLogId") REFERENCES "FlightLog" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExerciseProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "enrollmentId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "sessionId" TEXT,
    "level" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "instructorId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExerciseProgress_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExerciseProgress_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "TrainingExercise" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExerciseProgress_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExerciseProgress_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
