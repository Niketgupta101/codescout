-- AlterTable: collapse the single provider id into an ordered list, so a duplicate upload aliases onto the document
-- that already holds its content instead of being extracted a second time
ALTER TABLE "ProjectDocument" ADD COLUMN "providerExternalIds" TEXT[];

UPDATE "ProjectDocument"
SET "providerExternalIds" = ARRAY["providerExternalId"]
WHERE "providerExternalId" IS NOT NULL;

-- DropIndex
DROP INDEX "ProjectDocument_providerExternalId_idx";

-- AlterTable
ALTER TABLE "ProjectDocument" DROP COLUMN "providerExternalId";

-- CreateIndex
CREATE INDEX "ProjectDocument_providerExternalIds_idx" ON "ProjectDocument" USING GIN ("providerExternalIds");

-- DropIndex: checksum is only ever looked up within a project
DROP INDEX "ProjectDocument_checksum_idx";

-- CreateIndex
CREATE INDEX "ProjectDocument_projectId_checksum_idx" ON "ProjectDocument"("projectId", "checksum");
