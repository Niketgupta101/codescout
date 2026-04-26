-- Repository.metadata was only ever written with fileCount/symbolCount stats that nothing read
-- removed alongside the stats endpoints, so dropping the column too

ALTER TABLE "Repository" DROP COLUMN IF EXISTS "metadata";
