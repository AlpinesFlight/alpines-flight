-- CreateEnum
CREATE TYPE "MaintenanceVisitStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterTable
ALTER TABLE "KardexEntry" ADD COLUMN     "maintenanceVisitId" TEXT;

-- AlterTable
ALTER TABLE "MaintenanceRecord" ADD COLUMN     "intervalCycles" INTEGER,
ADD COLUMN     "intervalDays" INTEGER,
ADD COLUMN     "intervalHours" DOUBLE PRECISION,
ADD COLUMN     "maintenanceVisitId" TEXT;

-- CreateTable
CREATE TABLE "MaintenanceVisit" (
    "id" TEXT NOT NULL,
    "aircraftId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "MaintenanceVisitStatus" NOT NULL DEFAULT 'OPEN',
    "performedBy" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedById" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,

    CONSTRAINT "MaintenanceVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceVisitDocument" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileMimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileData" BYTEA NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "MaintenanceVisitDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaintenanceVisit_aircraftId_status_idx" ON "MaintenanceVisit"("aircraftId", "status");

-- CreateIndex
CREATE INDEX "MaintenanceVisitDocument_visitId_idx" ON "MaintenanceVisitDocument"("visitId");

-- CreateIndex
CREATE INDEX "KardexEntry_maintenanceVisitId_idx" ON "KardexEntry"("maintenanceVisitId");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_maintenanceVisitId_idx" ON "MaintenanceRecord"("maintenanceVisitId");

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_maintenanceVisitId_fkey" FOREIGN KEY ("maintenanceVisitId") REFERENCES "MaintenanceVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KardexEntry" ADD CONSTRAINT "KardexEntry_maintenanceVisitId_fkey" FOREIGN KEY ("maintenanceVisitId") REFERENCES "MaintenanceVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceVisit" ADD CONSTRAINT "MaintenanceVisit_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceVisit" ADD CONSTRAINT "MaintenanceVisit_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceVisit" ADD CONSTRAINT "MaintenanceVisit_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceVisitDocument" ADD CONSTRAINT "MaintenanceVisitDocument_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "MaintenanceVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceVisitDocument" ADD CONSTRAINT "MaintenanceVisitDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
