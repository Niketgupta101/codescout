-- CreateEnum
CREATE TYPE "ProjectDataOrigin" AS ENUM ('ai', 'human');

-- CreateEnum
CREATE TYPE "ProjectActionItemStatusSource" AS ENUM ('extracted', 'document', 'code', 'manual');

-- DropIndex (IF EXISTS: these hnsw indexes are unmodeled halfvec indexes recreated at the end, so the drop must be idempotent)
DROP INDEX IF EXISTS "public"."Message_contentEmbedding_hnsw_idx";

-- DropIndex
DROP INDEX IF EXISTS "public"."ProjectDocument_summaryEmbedding_hnsw_idx";

-- DropIndex
DROP INDEX IF EXISTS "public"."ProjectDocumentStatement_textDerivedEmbedding_hnsw_idx";

-- DropIndex
DROP INDEX IF EXISTS "public"."ProjectTopic_summaryEmbedding_hnsw_idx";

-- DropIndex
DROP INDEX IF EXISTS "public"."RepositoryFile_summaryEmbedding_hnsw_idx";

-- AlterTable
ALTER TABLE "ProjectDocumentActionItem" ADD COLUMN     "origin" "ProjectDataOrigin" NOT NULL DEFAULT 'ai',
ADD COLUMN     "projectActionItemId" UUID,
ADD COLUMN     "suppressed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ProjectActionItem" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "owner" TEXT,
    "expectedBy" TEXT,
    "status" "ProjectDocumentActionItemStatus" NOT NULL DEFAULT 'open',
    "statusSource" "ProjectActionItemStatusSource" NOT NULL DEFAULT 'extracted',
    "reason" TEXT,
    "resolvedByDocumentId" UUID,
    "resolvedByRepositoryFileId" UUID,
    "resolvedBySymbolId" UUID,
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "origin" "ProjectDataOrigin" NOT NULL DEFAULT 'ai',
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "summaryEmbedding" halfvec(3072),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectActionItem_projectId_status_idx" ON "ProjectActionItem"("projectId", "status");

-- CreateIndex
CREATE INDEX "ProjectDocumentActionItem_projectActionItemId_idx" ON "ProjectDocumentActionItem"("projectActionItemId");

-- AddForeignKey
ALTER TABLE "ProjectActionItem" ADD CONSTRAINT "ProjectActionItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectActionItem" ADD CONSTRAINT "ProjectActionItem_resolvedByDocumentId_fkey" FOREIGN KEY ("resolvedByDocumentId") REFERENCES "ProjectDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectActionItem" ADD CONSTRAINT "ProjectActionItem_resolvedByRepositoryFileId_fkey" FOREIGN KEY ("resolvedByRepositoryFileId") REFERENCES "RepositoryFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentActionItem" ADD CONSTRAINT "ProjectDocumentActionItem_projectActionItemId_fkey" FOREIGN KEY ("projectActionItemId") REFERENCES "ProjectActionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- these hnsw indexes live on Unsupported(halfvec) columns prisma cannot model, so migrate dev drops them as drift above;
-- recreate them (and add one for the new canonical action item embedding) so vector search stays indexed
CREATE INDEX "Message_contentEmbedding_hnsw_idx" ON "Message" USING hnsw ("contentEmbedding" halfvec_cosine_ops);
CREATE INDEX "ProjectDocument_summaryEmbedding_hnsw_idx" ON "ProjectDocument" USING hnsw ("summaryEmbedding" halfvec_cosine_ops);
CREATE INDEX "ProjectDocumentStatement_textDerivedEmbedding_hnsw_idx" ON "ProjectDocumentStatement" USING hnsw ("textDerivedEmbedding" halfvec_cosine_ops);
CREATE INDEX "ProjectTopic_summaryEmbedding_hnsw_idx" ON "ProjectTopic" USING hnsw ("summaryEmbedding" halfvec_cosine_ops);
CREATE INDEX "RepositoryFile_summaryEmbedding_hnsw_idx" ON "RepositoryFile" USING hnsw ("summaryEmbedding" halfvec_cosine_ops);
CREATE INDEX "ProjectActionItem_summaryEmbedding_hnsw_idx" ON "ProjectActionItem" USING hnsw ("summaryEmbedding" halfvec_cosine_ops);
