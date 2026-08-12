-- CreateEnum
CREATE TYPE "ProjectCorrectionEntity" AS ENUM ('statement', 'reference');

-- CreateEnum
CREATE TYPE "ProjectCorrectionOperation" AS ENUM ('edit', 'invalidate', 'add');

-- CreateEnum
CREATE TYPE "ProjectCorrectionStatus" AS ENUM ('active', 'orphaned');

-- DropIndex (IF EXISTS: these hnsw indexes are unmodeled halfvec indexes recreated at the end, so the drop must be idempotent)
DROP INDEX IF EXISTS "public"."Message_contentEmbedding_hnsw_idx";

-- DropIndex
DROP INDEX IF EXISTS "public"."ProjectActionItem_summaryEmbedding_hnsw_idx";

-- DropIndex
DROP INDEX IF EXISTS "public"."ProjectDocument_summaryEmbedding_hnsw_idx";

-- DropIndex
DROP INDEX IF EXISTS "public"."ProjectDocumentStatement_textDerivedEmbedding_hnsw_idx";

-- DropIndex
DROP INDEX IF EXISTS "public"."ProjectTopic_summaryEmbedding_hnsw_idx";

-- DropIndex
DROP INDEX IF EXISTS "public"."RepositoryFile_summaryEmbedding_hnsw_idx";

-- AlterTable
ALTER TABLE "ProjectDocumentReference" ADD COLUMN     "origin" "ProjectDataOrigin" NOT NULL DEFAULT 'ai',
ADD COLUMN     "suppressed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProjectDocumentStatement" ADD COLUMN     "origin" "ProjectDataOrigin" NOT NULL DEFAULT 'ai',
ADD COLUMN     "suppressed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProjectDocumentTopic" ADD COLUMN     "origin" "ProjectDataOrigin" NOT NULL DEFAULT 'ai',
ADD COLUMN     "suppressed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProjectTopic" ADD COLUMN     "origin" "ProjectDataOrigin" NOT NULL DEFAULT 'ai',
ADD COLUMN     "suppressed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ProjectDocumentCorrection" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "projectDocumentId" UUID,
    "entity" "ProjectCorrectionEntity" NOT NULL,
    "operation" "ProjectCorrectionOperation" NOT NULL,
    "anchorText" TEXT,
    "anchorEmbedding" halfvec(3072),
    "patch" JSONB NOT NULL,
    "status" "ProjectCorrectionStatus" NOT NULL DEFAULT 'active',
    "note" TEXT,
    "correctedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectDocumentCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectDocumentCorrection_projectId_entity_idx" ON "ProjectDocumentCorrection"("projectId", "entity");

-- CreateIndex
CREATE INDEX "ProjectDocumentCorrection_projectDocumentId_idx" ON "ProjectDocumentCorrection"("projectDocumentId");

-- AddForeignKey
ALTER TABLE "ProjectDocumentCorrection" ADD CONSTRAINT "ProjectDocumentCorrection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentCorrection" ADD CONSTRAINT "ProjectDocumentCorrection_projectDocumentId_fkey" FOREIGN KEY ("projectDocumentId") REFERENCES "ProjectDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- these hnsw indexes live on Unsupported(halfvec) columns prisma cannot model, so migrate drops them as drift above;
-- recreate them (and add one for the new correction anchor embedding) so vector search stays indexed
CREATE INDEX "Message_contentEmbedding_hnsw_idx" ON "Message" USING hnsw ("contentEmbedding" halfvec_cosine_ops);
CREATE INDEX "ProjectActionItem_summaryEmbedding_hnsw_idx" ON "ProjectActionItem" USING hnsw ("summaryEmbedding" halfvec_cosine_ops);
CREATE INDEX "ProjectDocument_summaryEmbedding_hnsw_idx" ON "ProjectDocument" USING hnsw ("summaryEmbedding" halfvec_cosine_ops);
CREATE INDEX "ProjectDocumentStatement_textDerivedEmbedding_hnsw_idx" ON "ProjectDocumentStatement" USING hnsw ("textDerivedEmbedding" halfvec_cosine_ops);
CREATE INDEX "ProjectTopic_summaryEmbedding_hnsw_idx" ON "ProjectTopic" USING hnsw ("summaryEmbedding" halfvec_cosine_ops);
CREATE INDEX "RepositoryFile_summaryEmbedding_hnsw_idx" ON "RepositoryFile" USING hnsw ("summaryEmbedding" halfvec_cosine_ops);
CREATE INDEX "ProjectDocumentCorrection_anchorEmbedding_hnsw_idx" ON "ProjectDocumentCorrection" USING hnsw ("anchorEmbedding" halfvec_cosine_ops);
