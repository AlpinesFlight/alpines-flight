-- CreateEnum
CREATE TYPE "AdminTaskStatus" AS ENUM ('TODO', 'DOING', 'DONE');

-- AlterTable: ajoute "status" avec valeur par défaut TODO, reprend les
-- lignes déjà existantes (done=true -> DONE) avant de retirer "done", pour
-- ne perdre aucune tâche déjà créée en production.
ALTER TABLE "AdminTask" ADD COLUMN "status" "AdminTaskStatus" NOT NULL DEFAULT 'TODO';
UPDATE "AdminTask" SET "status" = 'DONE' WHERE "done" = true;
ALTER TABLE "AdminTask" DROP COLUMN "done";

-- DropIndex
DROP INDEX IF EXISTS "AdminTask_done_dueDate_idx";

-- CreateIndex
CREATE INDEX "AdminTask_status_dueDate_idx" ON "AdminTask"("status", "dueDate");

-- CreateTable
CREATE TABLE "AdminNote" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "AdminNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminContact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "AdminContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminNote_pinned_updatedAt_idx" ON "AdminNote"("pinned", "updatedAt");

-- CreateIndex
CREATE INDEX "AdminContact_category_name_idx" ON "AdminContact"("category", "name");

-- AddForeignKey
ALTER TABLE "AdminNote" ADD CONSTRAINT "AdminNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminContact" ADD CONSTRAINT "AdminContact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
