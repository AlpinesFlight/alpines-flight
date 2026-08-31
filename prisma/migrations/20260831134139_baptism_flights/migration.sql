-- AlterTable
ALTER TABLE "FlightLog" ADD COLUMN     "isBaptism" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN     "canGiveBaptism" BOOLEAN NOT NULL DEFAULT false;
