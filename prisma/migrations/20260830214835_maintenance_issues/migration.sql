-- CreateEnum
CREATE TYPE "MaintenanceIssueStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "MaintenanceIssue" (
    "id" TEXT NOT NULL,
    "aircraftId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "MaintenanceIssueStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportedById" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNotes" TEXT,

    CONSTRAINT "MaintenanceIssue_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MaintenanceIssue" ADD CONSTRAINT "MaintenanceIssue_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceIssue" ADD CONSTRAINT "MaintenanceIssue_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceIssue" ADD CONSTRAINT "MaintenanceIssue_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
