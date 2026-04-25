-- CreateEnum
CREATE TYPE "RepositoryStatus" AS ENUM ('pending', 'cloning', 'indexing', 'completed', 'failed');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SymbolType" ADD VALUE 'interface';
ALTER TYPE "SymbolType" ADD VALUE 'type';
ALTER TYPE "SymbolType" ADD VALUE 'enum';
ALTER TYPE "SymbolType" ADD VALUE 'module';

-- DropIndex
DROP INDEX "public"."Node_summaryEmbedding_hnsw_idx";

-- CreateTable
CREATE TABLE "Repository" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'main',
    "lastCommit" TEXT,
    "status" "RepositoryStatus" NOT NULL DEFAULT 'pending',
    "metadata" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Repository_projectId_idx" ON "Repository"("projectId");

-- CreateIndex
CREATE INDEX "Repository_status_idx" ON "Repository"("status");

-- AddForeignKey
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
