-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN "clientEmail" TEXT;
ALTER TABLE "Reservation" ADD COLUMN "clientName" TEXT;
ALTER TABLE "Reservation" ADD COLUMN "clientPhone" TEXT;
ALTER TABLE "Reservation" ADD COLUMN "priceCents" INTEGER;

-- CreateTable
CREATE TABLE "SchoolDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'ALL',
    "fileName" TEXT NOT NULL,
    "fileMimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileData" BLOB NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,
    CONSTRAINT "SchoolDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
