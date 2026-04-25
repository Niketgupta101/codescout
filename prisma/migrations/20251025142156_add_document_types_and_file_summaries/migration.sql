-- CreateEnum
CREATE TYPE "RepositoryType" AS ENUM ('backend_codebase', 'web_codebase', 'app_codebase', 'custom');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('tech_spec', 'user_stories', 'meeting_notes', 'requirements', 'design_doc', 'custom');

-- AlterTable
ALTER TABLE "CodeFile" ADD COLUMN     "documentType" TEXT,
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "summaryEmbedding" vector(1536);

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "documentType" "DocumentType";

-- AlterTable
ALTER TABLE "Repository" ADD COLUMN     "repositoryType" "RepositoryType";

-- CreateIndex
CREATE INDEX "CodeFile_projectId_documentType_idx" ON "CodeFile"("projectId", "documentType");
