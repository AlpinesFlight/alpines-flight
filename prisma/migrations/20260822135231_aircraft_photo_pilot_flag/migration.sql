-- AlterTable
ALTER TABLE "Aircraft" ADD COLUMN "photoData" BLOB;
ALTER TABLE "Aircraft" ADD COLUMN "photoFileName" TEXT;
ALTER TABLE "Aircraft" ADD COLUMN "photoMimeType" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StudentProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "licenseType" TEXT,
    "licenseNumber" TEXT,
    "medicalExpiry" DATETIME,
    "totalHours" REAL NOT NULL DEFAULT 0,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "isPilot" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StudentProfile" ("balanceCents", "createdAt", "id", "licenseNumber", "licenseType", "medicalExpiry", "notes", "totalHours", "updatedAt", "userId") SELECT "balanceCents", "createdAt", "id", "licenseNumber", "licenseType", "medicalExpiry", "notes", "totalHours", "updatedAt", "userId" FROM "StudentProfile";
DROP TABLE "StudentProfile";
ALTER TABLE "new_StudentProfile" RENAME TO "StudentProfile";
CREATE UNIQUE INDEX "StudentProfile_userId_key" ON "StudentProfile"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
