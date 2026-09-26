-- AlterTable
ALTER TABLE "AccountTransaction" ADD COLUMN     "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "AccountTransaction_date_idx" ON "AccountTransaction"("date");

-- Rattrapage des mouvements existants : la date d'une opération est celle de
-- l'événement, pas celle de sa saisie (voir AccountTransaction.date).

-- Débits de vol : départ du vol relié.
UPDATE "AccountTransaction" AS t
SET "date" = f."departureTime"
FROM "FlightLog" AS f
WHERE t."flightLogId" = f."id";

-- Versements : date de la déclaration (la date réelle du virement n'a jamais été
-- saisie ; la déclaration suit le virement de près, alors que la confirmation
-- peut venir plusieurs jours après). Corrigeable ensuite depuis la page Comptes
-- pilotes.
UPDATE "AccountTransaction"
SET "date" = "createdAt"
WHERE "type" = 'DEPOSIT';

-- Tout le reste sans vol relié (ajustements...) : date de l'écriture.
UPDATE "AccountTransaction"
SET "date" = COALESCE("confirmedAt", "createdAt")
WHERE "flightLogId" IS NULL AND "type" <> 'DEPOSIT';
