-- CreateEnum
CREATE TYPE "AdminDocumentStatus" AS ENUM ('PENDING', 'PROCESSED');

-- CreateEnum
CREATE TYPE "AdminTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "AdminDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "status" "AdminDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "fileName" TEXT NOT NULL,
    "fileMimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileData" BYTEA NOT NULL,
    "notes" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "AdminDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "priority" "AdminTaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "done" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "AdminTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminEvent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "AdminEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminDocument_status_uploadedAt_idx" ON "AdminDocument"("status", "uploadedAt");

-- CreateIndex
CREATE INDEX "AdminTask_done_dueDate_idx" ON "AdminTask"("done", "dueDate");

-- CreateIndex
CREATE INDEX "AdminEvent_startTime_idx" ON "AdminEvent"("startTime");

-- AddForeignKey
ALTER TABLE "AdminDocument" ADD CONSTRAINT "AdminDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminTask" ADD CONSTRAINT "AdminTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminEvent" ADD CONSTRAINT "AdminEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
