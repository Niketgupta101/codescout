/*
  Warnings:

  - You are about to drop the column `nodeId` on the `Symbol` table. All the data in the column will be lost.
  - You are about to drop the `Node` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Relation` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `codeFileId` to the `Symbol` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Node" DROP CONSTRAINT "Node_documentId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Node" DROP CONSTRAINT "Node_parentId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Node" DROP CONSTRAINT "Node_projectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Node" DROP CONSTRAINT "Node_repositoryId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Relation" DROP CONSTRAINT "Relation_projectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Relation" DROP CONSTRAINT "Relation_sourceNodeId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Relation" DROP CONSTRAINT "Relation_targetNodeId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Symbol" DROP CONSTRAINT "Symbol_nodeId_fkey";

-- AlterTable
ALTER TABLE "Symbol" DROP COLUMN "nodeId",
ADD COLUMN     "codeFileId" UUID NOT NULL;

-- DropTable
DROP TABLE "public"."Node";

-- DropTable
DROP TABLE "public"."Relation";

-- DropEnum
DROP TYPE "public"."NodeLevel";

-- DropEnum
DROP TYPE "public"."NodeType";

-- DropEnum
DROP TYPE "public"."RelationType";

-- CreateTable
CREATE TABLE "CodeFile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID NOT NULL,
    "repositoryId" UUID,
    "documentId" UUID,
    "path" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodeFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CodeFile_projectId_language_idx" ON "CodeFile"("projectId", "language");

-- CreateIndex
CREATE INDEX "CodeFile_repositoryId_idx" ON "CodeFile"("repositoryId");

-- CreateIndex
CREATE INDEX "CodeFile_documentId_idx" ON "CodeFile"("documentId");

-- CreateIndex
CREATE INDEX "CodeFile_checksum_idx" ON "CodeFile"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "CodeFile_projectId_path_key" ON "CodeFile"("projectId", "path");

-- CreateIndex
CREATE INDEX "Symbol_codeFileId_idx" ON "Symbol"("codeFileId");

-- AddForeignKey
ALTER TABLE "CodeFile" ADD CONSTRAINT "CodeFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeFile" ADD CONSTRAINT "CodeFile_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeFile" ADD CONSTRAINT "CodeFile_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Symbol" ADD CONSTRAINT "Symbol_codeFileId_fkey" FOREIGN KEY ("codeFileId") REFERENCES "CodeFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
