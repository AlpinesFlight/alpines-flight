-- Retire NIVEAU_CIBLE de l'enum ProgressLevel : ce niveau n'existe pas
-- dans les programmes de formation (Assimilée est le niveau maximum).
-- Aucune ligne ExerciseProgress ne l'utilise (vérifié avant migration),
-- donc pas de conversion de données nécessaire.
BEGIN;
CREATE TYPE "ProgressLevel_new" AS ENUM ('NON_VU', 'VU', 'ASSIMILE');
ALTER TABLE "ExerciseProgress" ALTER COLUMN "level" TYPE "ProgressLevel_new" USING ("level"::text::"ProgressLevel_new");
ALTER TYPE "ProgressLevel" RENAME TO "ProgressLevel_old";
ALTER TYPE "ProgressLevel_new" RENAME TO "ProgressLevel";
DROP TYPE "ProgressLevel_old";
COMMIT;
