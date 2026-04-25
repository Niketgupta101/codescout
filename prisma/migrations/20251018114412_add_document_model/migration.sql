-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('pending', 'indexing', 'completed', 'failed');

-- AlterTable
ALTER TABLE "Node" ADD COLUMN     "documentId" UUID,
ADD COLUMN     "repositoryId" UUID;

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'pending',
    "metadata" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Document_projectId_idx" ON "Document"("projectId");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE INDEX "Node_documentId_idx" ON "Node"("documentId");

-- CreateIndex
CREATE INDEX "Node_repositoryId_idx" ON "Node"("repositoryId");

-- AddForeignKey
ALTER TABLE "Node" ADD CONSTRAINT "Node_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Node" ADD CONSTRAINT "Node_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
