-- CreateEnum
CREATE TYPE "ProjectFolderImportStatus" AS ENUM ('running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "ProjectFolderImport" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "projectFolderId" UUID NOT NULL,
    "status" "ProjectFolderImportStatus" NOT NULL DEFAULT 'running',
    "filesTotal" INTEGER NOT NULL DEFAULT 0,
    "filesProcessed" INTEGER NOT NULL DEFAULT 0,
    "documentsChanged" INTEGER NOT NULL DEFAULT 0,
    "currentPath" TEXT,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectFolderImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectFolderImport_projectFolderId_createdAt_idx" ON "ProjectFolderImport"("projectFolderId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectFolderImport_status_idx" ON "ProjectFolderImport"("status");

-- AddForeignKey
ALTER TABLE "ProjectFolderImport" ADD CONSTRAINT "ProjectFolderImport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFolderImport" ADD CONSTRAINT "ProjectFolderImport_projectFolderId_fkey" FOREIGN KEY ("projectFolderId") REFERENCES "ProjectFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
