-- AlterTable
ALTER TABLE "TrainingProgram" ADD COLUMN "instructionRateCents" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FlightLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reservationId" TEXT,
    "aircraftId" TEXT NOT NULL,
    "studentId" TEXT,
    "instructorId" TEXT,
    "trainingProgramId" TEXT,
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
    CONSTRAINT "FlightLog_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FlightLog_trainingProgramId_fkey" FOREIGN KEY ("trainingProgramId") REFERENCES "TrainingProgram" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FlightLog" ("aircraftCostCents", "aircraftId", "arrivalTime", "createdAt", "date", "departureTime", "duration", "fuelAirfield", "fuelCard", "fuelLiters", "fuelRefillDone", "fuelType", "id", "instructionCostCents", "instructorId", "remarks", "reservationId", "studentId", "totalLandings") SELECT "aircraftCostCents", "aircraftId", "arrivalTime", "createdAt", "date", "departureTime", "duration", "fuelAirfield", "fuelCard", "fuelLiters", "fuelRefillDone", "fuelType", "id", "instructionCostCents", "instructorId", "remarks", "reservationId", "studentId", "totalLandings" FROM "FlightLog";
DROP TABLE "FlightLog";
ALTER TABLE "new_FlightLog" RENAME TO "FlightLog";
CREATE UNIQUE INDEX "FlightLog_reservationId_key" ON "FlightLog"("reservationId");
CREATE TABLE "new_Reservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aircraftId" TEXT NOT NULL,
    "studentId" TEXT,
    "instructorId" TEXT,
    "trainingProgramId" TEXT,
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
    CONSTRAINT "Reservation_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Reservation_trainingProgramId_fkey" FOREIGN KEY ("trainingProgramId") REFERENCES "TrainingProgram" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Reservation" ("actualDepartureTime", "aircraftId", "createdAt", "endTime", "id", "instructorId", "notes", "startTime", "status", "studentId", "type", "updatedAt") SELECT "actualDepartureTime", "aircraftId", "createdAt", "endTime", "id", "instructorId", "notes", "startTime", "status", "studentId", "type", "updatedAt" FROM "Reservation";
DROP TABLE "Reservation";
ALTER TABLE "new_Reservation" RENAME TO "Reservation";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
