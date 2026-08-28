-- AlterTable
ALTER TABLE "SchoolSettings" ADD COLUMN     "notifyOnReservationCancelled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyOnReservationCreated" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyReminderEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "DocumentNotification" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "DocumentNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentNotification_documentId_userId_key" ON "DocumentNotification"("documentId", "userId");

-- AddForeignKey
ALTER TABLE "DocumentNotification" ADD CONSTRAINT "DocumentNotification_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SchoolDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentNotification" ADD CONSTRAINT "DocumentNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
