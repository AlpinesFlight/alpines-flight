-- AlterTable
ALTER TABLE "Qualification" ADD COLUMN     "kind" TEXT;

-- AlterTable
ALTER TABLE "QualificationDocument" ADD COLUMN     "variant" TEXT;

-- CreateTable
CREATE TABLE "PilotDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT,
    "fileName" TEXT NOT NULL,
    "fileMimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "blobUrl" TEXT,
    "fileData" BYTEA,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,

    CONSTRAINT "PilotDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ValidityDocuments" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ValidityDocuments_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "PilotDocument_userId_idx" ON "PilotDocument"("userId");

-- CreateIndex
CREATE INDEX "_ValidityDocuments_B_index" ON "_ValidityDocuments"("B");

-- CreateIndex
CREATE INDEX "Qualification_userId_idx" ON "Qualification"("userId");

-- AddForeignKey
ALTER TABLE "PilotDocument" ADD CONSTRAINT "PilotDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotDocument" ADD CONSTRAINT "PilotDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ValidityDocuments" ADD CONSTRAINT "_ValidityDocuments_A_fkey" FOREIGN KEY ("A") REFERENCES "PilotDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ValidityDocuments" ADD CONSTRAINT "_ValidityDocuments_B_fkey" FOREIGN KEY ("B") REFERENCES "QualificationDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Reprise des fichiers existants : jusqu'ici chaque validité portait son
-- propre fichier. Un justificatif (PilotDocument) par validité qui avait un
-- fichier, avec le MÊME id — les anciens liens .../documents/<id>/file
-- mènent donc toujours au bon fichier — puis relié à cette validité.
-- Idempotent (ON CONFLICT DO NOTHING) : peut être rejoué sans doublon.
INSERT INTO "PilotDocument" ("id", "userId", "category", "fileName", "fileMimeType", "fileSize", "blobUrl", "fileData", "uploadedAt", "uploadedById")
SELECT qd."id",
       q."userId",
       CASE q."type"
         WHEN 'MEDICAL' THEN 'MEDICAL'
         WHEN 'EXAMINER_PRIV' THEN 'ATTESTATION'
         WHEN 'OTHER' THEN 'OTHER'
         ELSE 'LICENCE'
       END,
       qd."fileName",
       COALESCE(qd."fileMimeType", 'application/octet-stream'),
       COALESCE(qd."fileSize", 0),
       qd."blobUrl",
       qd."fileData",
       qd."uploadedAt",
       qd."uploadedById"
FROM "QualificationDocument" qd
JOIN "Qualification" q ON q."id" = qd."qualificationId"
WHERE qd."fileName" IS NOT NULL
  AND (qd."blobUrl" IS NOT NULL OR qd."fileData" IS NOT NULL)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "_ValidityDocuments" ("A", "B")
SELECT pd."id", pd."id"
FROM "PilotDocument" pd
WHERE EXISTS (SELECT 1 FROM "QualificationDocument" qd WHERE qd."id" = pd."id")
ON CONFLICT DO NOTHING;
