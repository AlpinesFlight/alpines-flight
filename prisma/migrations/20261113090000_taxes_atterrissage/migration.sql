-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'LANDING_FEE';

-- AlterTable
ALTER TABLE "AccountTransaction" ADD COLUMN     "airfield" TEXT,
ADD COLUMN     "landingFlightLogId" TEXT;

-- CreateTable
CREATE TABLE "AccountTransactionAttachment" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileMimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountTransactionAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountTransactionAttachment_transactionId_key" ON "AccountTransactionAttachment"("transactionId");

-- CreateIndex
CREATE INDEX "AccountTransaction_landingFlightLogId_idx" ON "AccountTransaction"("landingFlightLogId");

-- AddForeignKey
ALTER TABLE "AccountTransaction" ADD CONSTRAINT "AccountTransaction_landingFlightLogId_fkey" FOREIGN KEY ("landingFlightLogId") REFERENCES "FlightLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountTransactionAttachment" ADD CONSTRAINT "AccountTransactionAttachment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "AccountTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

