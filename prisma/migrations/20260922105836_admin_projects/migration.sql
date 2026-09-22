-- CreateEnum
CREATE TYPE "AdminProjectStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "AdminTask" ADD COLUMN     "projectId" TEXT;

-- CreateTable
CREATE TABLE "AdminProject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#f04818',
    "status" "AdminProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "AdminProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminProject_status_dueDate_idx" ON "AdminProject"("status", "dueDate");

-- CreateIndex
CREATE INDEX "AdminTask_projectId_idx" ON "AdminTask"("projectId");

-- AddForeignKey
ALTER TABLE "AdminTask" ADD CONSTRAINT "AdminTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "AdminProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminProject" ADD CONSTRAINT "AdminProject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
