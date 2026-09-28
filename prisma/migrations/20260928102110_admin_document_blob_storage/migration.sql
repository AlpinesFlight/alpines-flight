-- AlterTable
ALTER TABLE "AdminDocument" ADD COLUMN     "blobUrl" TEXT,
ALTER COLUMN "fileData" DROP NOT NULL;
