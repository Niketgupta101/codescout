-- adds Directory entity (with self-referential hierarchy), Project.summary, and CodeFile.directoryId FK
-- the HNSW indexes on summaryEmbedding/contentEmbedding are managed outside Prisma (Unsupported types) — do not drop

-- AlterTable
ALTER TABLE "CodeFile" ADD COLUMN     "directoryId" UUID;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "summary" TEXT;

-- CreateTable
CREATE TABLE "Directory" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "parentId" UUID,
    "fullPath" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Directory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Directory_projectId_parentId_idx" ON "Directory"("projectId", "parentId");

-- CreateIndex
CREATE INDEX "Directory_projectId_depth_idx" ON "Directory"("projectId", "depth");

-- CreateIndex
CREATE UNIQUE INDEX "Directory_projectId_fullPath_key" ON "Directory"("projectId", "fullPath");

-- CreateIndex
CREATE INDEX "CodeFile_directoryId_idx" ON "CodeFile"("directoryId");

-- AddForeignKey
ALTER TABLE "Directory" ADD CONSTRAINT "Directory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Directory" ADD CONSTRAINT "Directory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Directory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeFile" ADD CONSTRAINT "CodeFile_directoryId_fkey" FOREIGN KEY ("directoryId") REFERENCES "Directory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
