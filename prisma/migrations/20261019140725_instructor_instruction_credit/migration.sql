-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'INSTRUCTION_CREDIT';

-- AlterTable
ALTER TABLE "AccountTransaction" ADD COLUMN     "instructorFlightLogId" TEXT;

-- AlterTable
ALTER TABLE "FlightLog" ADD COLUMN     "instructorSharePct" INTEGER;

-- AlterTable
ALTER TABLE "InstructorProfile" ADD COLUMN     "instructionSharePct" INTEGER NOT NULL DEFAULT 100;

-- CreateIndex
CREATE UNIQUE INDEX "AccountTransaction_instructorFlightLogId_key" ON "AccountTransaction"("instructorFlightLogId");

-- AddForeignKey
ALTER TABLE "AccountTransaction" ADD CONSTRAINT "AccountTransaction_instructorFlightLogId_fkey" FOREIGN KEY ("instructorFlightLogId") REFERENCES "FlightLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

