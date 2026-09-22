/*
  Warnings:

  - You are about to drop the `AdminSettings` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AdminSettings" DROP CONSTRAINT "AdminSettings_updatedById_fkey";

-- DropTable
DROP TABLE "AdminSettings";
