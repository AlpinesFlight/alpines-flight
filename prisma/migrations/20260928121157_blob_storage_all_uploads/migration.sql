-- AlterTable
ALTER TABLE "Aircraft" ADD COLUMN     "photoBlobUrl" TEXT;

-- AlterTable
ALTER TABLE "AnnouncementAttachment" ADD COLUMN     "blobUrl" TEXT,
ALTER COLUMN "fileData" DROP NOT NULL;

-- AlterTable
ALTER TABLE "FlightPrepDocument" ADD COLUMN     "blobUrl" TEXT,
ALTER COLUMN "fileData" DROP NOT NULL;

-- AlterTable
ALTER TABLE "MaintenanceVisitDocument" ADD COLUMN     "blobUrl" TEXT,
ALTER COLUMN "fileData" DROP NOT NULL;

-- AlterTable
ALTER TABLE "QualificationDocument" ADD COLUMN     "blobUrl" TEXT;

-- AlterTable
ALTER TABLE "SchoolDocument" ADD COLUMN     "blobUrl" TEXT,
ALTER COLUMN "fileData" DROP NOT NULL;

-- AlterTable
ALTER TABLE "TheoryClassDocument" ADD COLUMN     "blobUrl" TEXT,
ALTER COLUMN "fileData" DROP NOT NULL;
