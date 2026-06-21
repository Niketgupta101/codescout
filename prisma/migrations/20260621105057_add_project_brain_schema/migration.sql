/*
  Warnings:

  - You are about to drop the column `documentType` on the `ProjectDocument` table. All the data in the column will be lost.
  - You are about to drop the column `filename` on the `ProjectDocument` table. All the data in the column will be lost.
  - You are about to drop the column `format` on the `ProjectDocument` table. All the data in the column will be lost.
  - You are about to drop the column `metadata` on the `ProjectDocument` table. All the data in the column will be lost.
  - You are about to drop the column `documentId` on the `RepositoryFile` table. All the data in the column will be lost.
  - Added the required column `contentRaw` to the `ProjectDocument` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contentType` to the `ProjectDocument` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `ProjectDocument` table without a default value. This is not possible if the table is not empty.
  - Added the required column `occurredAt` to the `ProjectDocument` table without a default value. This is not possible if the table is not empty.
  - Added the required column `path` to the `ProjectDocument` table without a default value. This is not possible if the table is not empty.
  - Added the required column `provider` to the `ProjectDocument` table without a default value. This is not possible if the table is not empty.
  - Made the column `repositoryId` on table `RepositoryFile` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "ProjectDocumentProvider" AS ENUM ('googleDrive', 'chat', 'manual');

-- CreateEnum
CREATE TYPE "ProjectDocumentType" AS ENUM ('conceptPaper', 'scopeDocument', 'transcript', 'userStory', 'implementationPlan', 'feedback', 'changeRequest', 'chat', 'architectureDecisionRecord', 'knowledgeDoc', 'other');

-- CreateEnum
CREATE TYPE "ProjectFolderProvider" AS ENUM ('googleDrive');

-- CreateEnum
CREATE TYPE "ProjectTopicType" AS ENUM ('feature', 'component', 'system', 'decision');

-- CreateEnum
CREATE TYPE "ProjectDocumentStatementType" AS ENUM ('fact', 'proposal', 'decision', 'question');

-- CreateEnum
CREATE TYPE "ProjectDocumentDecisionStatus" AS ENUM ('open', 'accepted', 'rejected', 'deferred', 'superseded');

-- CreateEnum
CREATE TYPE "ProjectDocumentImplementationStatus" AS ENUM ('notStarted', 'inProgress', 'blocked', 'done', 'reverted');

-- CreateEnum
CREATE TYPE "ProjectDocumentActionItemStatus" AS ENUM ('open', 'inProgress', 'blocked', 'done', 'lapsed');

-- CreateEnum
CREATE TYPE "ProjectDocumentReferenceResolution" AS ENUM ('notFound', 'linked', 'contradicted');

-- CreateEnum
CREATE TYPE "DecisionRecordType" AS ENUM ('architecture');

-- CreateEnum
CREATE TYPE "DecisionRecordStatus" AS ENUM ('proposed', 'accepted', 'deprecated', 'superseded');

-- DropForeignKey
ALTER TABLE "public"."RepositoryFile" DROP CONSTRAINT "RepositoryFile_documentId_fkey";

-- DropIndex
DROP INDEX "public"."Message_contentEmbedding_hnsw_idx";

-- DropIndex
DROP INDEX "public"."RepositoryFile_documentId_idx";

-- DropIndex
DROP INDEX "public"."RepositoryFile_summaryEmbedding_hnsw_idx";

-- AlterTable
ALTER TABLE "ProjectDocument" DROP COLUMN "documentType",
DROP COLUMN "filename",
DROP COLUMN "format",
DROP COLUMN "metadata",
ADD COLUMN     "aiClassificationOutput" TEXT,
ADD COLUMN     "artifactKey" TEXT,
ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "contentRaw" TEXT NOT NULL,
ADD COLUMN     "contentType" TEXT NOT NULL,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "occurredAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "path" TEXT NOT NULL,
ADD COLUMN     "projectFolderId" UUID,
ADD COLUMN     "provider" "ProjectDocumentProvider" NOT NULL,
ADD COLUMN     "providerExternalId" TEXT,
ADD COLUMN     "providerExternalModifiedAt" TIMESTAMP(3),
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "summaryEmbedding" halfvec(3072),
ADD COLUMN     "supersedesDocumentId" UUID,
ADD COLUMN     "type" "ProjectDocumentType" NOT NULL DEFAULT 'other',
ADD COLUMN     "versionLabel" TEXT;

-- AlterTable
ALTER TABLE "RepositoryFile" DROP COLUMN "documentId",
ALTER COLUMN "repositoryId" SET NOT NULL;

-- DropEnum
DROP TYPE "public"."DocumentFormat";

-- DropEnum
DROP TYPE "public"."DocumentType";

-- CreateTable
CREATE TABLE "ProjectFolder" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "provider" "ProjectFolderProvider" NOT NULL DEFAULT 'googleDrive',
    "providerId" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTopic" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nameAliases" TEXT[],
    "type" "ProjectTopicType",
    "summary" TEXT,
    "summaryEmbedding" halfvec(3072),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDocumentTopic" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "projectDocumentId" UUID NOT NULL,
    "projectTopicId" UUID,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectDocumentTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDocumentStatement" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "projectDocumentId" UUID NOT NULL,
    "projectDocumentTopicId" UUID NOT NULL,
    "textRaw" TEXT NOT NULL,
    "textDerived" TEXT NOT NULL,
    "textDerivedEmbedding" halfvec(3072),
    "type" "ProjectDocumentStatementType" NOT NULL,
    "decisionStatus" "ProjectDocumentDecisionStatus",
    "implementationStatus" "ProjectDocumentImplementationStatus",
    "optionTopicId" UUID,
    "reason" TEXT,
    "replacesPriorStatementText" TEXT,
    "replacesPriorStatementId" UUID,
    "replacedByStatementId" UUID,
    "actor" TEXT,
    "aiAnalysisOutput" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectDocumentStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDocumentActionItem" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "projectDocumentId" UUID NOT NULL,
    "projectDocumentTopicId" UUID,
    "owner" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "expectedBy" TEXT,
    "status" "ProjectDocumentActionItemStatus" NOT NULL DEFAULT 'open',
    "blockedOn" TEXT,
    "reason" TEXT,
    "resolvedByDocumentId" UUID,
    "textRaw" TEXT NOT NULL,
    "aiAnalysisOutput" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectDocumentActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDocumentReference" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "fromProjectDocumentId" UUID NOT NULL,
    "projectDocumentTopicId" UUID,
    "referentText" TEXT NOT NULL,
    "expectation" TEXT NOT NULL,
    "resolution" "ProjectDocumentReferenceResolution" NOT NULL DEFAULT 'notFound',
    "resolvedToDocumentId" UUID,
    "resolvedToStatementId" UUID,
    "textRaw" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectDocumentReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionRecord" (
    "id" UUID NOT NULL,
    "projectId" UUID,
    "type" "DecisionRecordType" NOT NULL DEFAULT 'architecture',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reason" TEXT,
    "status" "DecisionRecordStatus" NOT NULL DEFAULT 'proposed',
    "decidedAt" TIMESTAMP(3),
    "sourceStatementIds" UUID[],
    "supersedesRecordId" UUID,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DecisionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ProjectTopicRelatedDocuments" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_ProjectTopicRelatedDocuments_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ProjectTopicRelatedDirectories" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_ProjectTopicRelatedDirectories_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectFolder_projectId_provider_providerId_key" ON "ProjectFolder"("projectId", "provider", "providerId");

-- CreateIndex
CREATE INDEX "ProjectTopic_projectId_idx" ON "ProjectTopic"("projectId");

-- CreateIndex
CREATE INDEX "ProjectDocumentTopic_projectDocumentId_idx" ON "ProjectDocumentTopic"("projectDocumentId");

-- CreateIndex
CREATE INDEX "ProjectDocumentTopic_projectTopicId_idx" ON "ProjectDocumentTopic"("projectTopicId");

-- CreateIndex
CREATE INDEX "ProjectDocumentStatement_projectDocumentId_idx" ON "ProjectDocumentStatement"("projectDocumentId");

-- CreateIndex
CREATE INDEX "ProjectDocumentStatement_projectDocumentTopicId_idx" ON "ProjectDocumentStatement"("projectDocumentTopicId");

-- CreateIndex
CREATE INDEX "ProjectDocumentStatement_projectId_type_idx" ON "ProjectDocumentStatement"("projectId", "type");

-- CreateIndex
CREATE INDEX "ProjectDocumentStatement_projectId_decisionStatus_idx" ON "ProjectDocumentStatement"("projectId", "decisionStatus");

-- CreateIndex
CREATE INDEX "ProjectDocumentStatement_validUntil_idx" ON "ProjectDocumentStatement"("validUntil");

-- CreateIndex
CREATE INDEX "ProjectDocumentActionItem_projectDocumentId_idx" ON "ProjectDocumentActionItem"("projectDocumentId");

-- CreateIndex
CREATE INDEX "ProjectDocumentActionItem_projectId_status_idx" ON "ProjectDocumentActionItem"("projectId", "status");

-- CreateIndex
CREATE INDEX "ProjectDocumentReference_fromProjectDocumentId_idx" ON "ProjectDocumentReference"("fromProjectDocumentId");

-- CreateIndex
CREATE INDEX "ProjectDocumentReference_projectId_resolution_idx" ON "ProjectDocumentReference"("projectId", "resolution");

-- CreateIndex
CREATE INDEX "DecisionRecord_projectId_status_idx" ON "DecisionRecord"("projectId", "status");

-- CreateIndex
CREATE INDEX "_ProjectTopicRelatedDocuments_B_index" ON "_ProjectTopicRelatedDocuments"("B");

-- CreateIndex
CREATE INDEX "_ProjectTopicRelatedDirectories_B_index" ON "_ProjectTopicRelatedDirectories"("B");

-- CreateIndex
CREATE INDEX "ProjectDocument_projectId_type_idx" ON "ProjectDocument"("projectId", "type");

-- CreateIndex
CREATE INDEX "ProjectDocument_projectId_occurredAt_idx" ON "ProjectDocument"("projectId", "occurredAt");

-- CreateIndex
CREATE INDEX "ProjectDocument_projectFolderId_idx" ON "ProjectDocument"("projectFolderId");

-- CreateIndex
CREATE INDEX "ProjectDocument_providerExternalId_idx" ON "ProjectDocument"("providerExternalId");

-- CreateIndex
CREATE INDEX "ProjectDocument_artifactKey_idx" ON "ProjectDocument"("artifactKey");

-- CreateIndex
CREATE INDEX "ProjectDocument_checksum_idx" ON "ProjectDocument"("checksum");

-- AddForeignKey
ALTER TABLE "ProjectDocument" ADD CONSTRAINT "ProjectDocument_projectFolderId_fkey" FOREIGN KEY ("projectFolderId") REFERENCES "ProjectFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocument" ADD CONSTRAINT "ProjectDocument_supersedesDocumentId_fkey" FOREIGN KEY ("supersedesDocumentId") REFERENCES "ProjectDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFolder" ADD CONSTRAINT "ProjectFolder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTopic" ADD CONSTRAINT "ProjectTopic_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentTopic" ADD CONSTRAINT "ProjectDocumentTopic_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentTopic" ADD CONSTRAINT "ProjectDocumentTopic_projectDocumentId_fkey" FOREIGN KEY ("projectDocumentId") REFERENCES "ProjectDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentTopic" ADD CONSTRAINT "ProjectDocumentTopic_projectTopicId_fkey" FOREIGN KEY ("projectTopicId") REFERENCES "ProjectTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentStatement" ADD CONSTRAINT "ProjectDocumentStatement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentStatement" ADD CONSTRAINT "ProjectDocumentStatement_projectDocumentId_fkey" FOREIGN KEY ("projectDocumentId") REFERENCES "ProjectDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentStatement" ADD CONSTRAINT "ProjectDocumentStatement_projectDocumentTopicId_fkey" FOREIGN KEY ("projectDocumentTopicId") REFERENCES "ProjectDocumentTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentStatement" ADD CONSTRAINT "ProjectDocumentStatement_optionTopicId_fkey" FOREIGN KEY ("optionTopicId") REFERENCES "ProjectDocumentTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentStatement" ADD CONSTRAINT "ProjectDocumentStatement_replacesPriorStatementId_fkey" FOREIGN KEY ("replacesPriorStatementId") REFERENCES "ProjectDocumentStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentStatement" ADD CONSTRAINT "ProjectDocumentStatement_replacedByStatementId_fkey" FOREIGN KEY ("replacedByStatementId") REFERENCES "ProjectDocumentStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentActionItem" ADD CONSTRAINT "ProjectDocumentActionItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentActionItem" ADD CONSTRAINT "ProjectDocumentActionItem_projectDocumentId_fkey" FOREIGN KEY ("projectDocumentId") REFERENCES "ProjectDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentActionItem" ADD CONSTRAINT "ProjectDocumentActionItem_projectDocumentTopicId_fkey" FOREIGN KEY ("projectDocumentTopicId") REFERENCES "ProjectDocumentTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentActionItem" ADD CONSTRAINT "ProjectDocumentActionItem_resolvedByDocumentId_fkey" FOREIGN KEY ("resolvedByDocumentId") REFERENCES "ProjectDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentReference" ADD CONSTRAINT "ProjectDocumentReference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentReference" ADD CONSTRAINT "ProjectDocumentReference_fromProjectDocumentId_fkey" FOREIGN KEY ("fromProjectDocumentId") REFERENCES "ProjectDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentReference" ADD CONSTRAINT "ProjectDocumentReference_projectDocumentTopicId_fkey" FOREIGN KEY ("projectDocumentTopicId") REFERENCES "ProjectDocumentTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentReference" ADD CONSTRAINT "ProjectDocumentReference_resolvedToDocumentId_fkey" FOREIGN KEY ("resolvedToDocumentId") REFERENCES "ProjectDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentReference" ADD CONSTRAINT "ProjectDocumentReference_resolvedToStatementId_fkey" FOREIGN KEY ("resolvedToStatementId") REFERENCES "ProjectDocumentStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionRecord" ADD CONSTRAINT "DecisionRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionRecord" ADD CONSTRAINT "DecisionRecord_supersedesRecordId_fkey" FOREIGN KEY ("supersedesRecordId") REFERENCES "DecisionRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProjectTopicRelatedDocuments" ADD CONSTRAINT "_ProjectTopicRelatedDocuments_A_fkey" FOREIGN KEY ("A") REFERENCES "ProjectDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProjectTopicRelatedDocuments" ADD CONSTRAINT "_ProjectTopicRelatedDocuments_B_fkey" FOREIGN KEY ("B") REFERENCES "ProjectTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProjectTopicRelatedDirectories" ADD CONSTRAINT "_ProjectTopicRelatedDirectories_A_fkey" FOREIGN KEY ("A") REFERENCES "ProjectTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProjectTopicRelatedDirectories" ADD CONSTRAINT "_ProjectTopicRelatedDirectories_B_fkey" FOREIGN KEY ("B") REFERENCES "RepositoryDirectory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- hnsw vector indexes (managed outside prisma - halfvec embedding columns are Unsupported types)
-- recreate the two prisma dropped above (it can't see indexes on Unsupported columns), then add the new brain ones
CREATE INDEX "RepositoryFile_summaryEmbedding_hnsw_idx" ON "RepositoryFile" USING hnsw ("summaryEmbedding" halfvec_cosine_ops);
CREATE INDEX "Message_contentEmbedding_hnsw_idx" ON "Message" USING hnsw ("contentEmbedding" halfvec_cosine_ops);
CREATE INDEX "ProjectDocument_summaryEmbedding_hnsw_idx" ON "ProjectDocument" USING hnsw ("summaryEmbedding" halfvec_cosine_ops);
CREATE INDEX "ProjectTopic_summaryEmbedding_hnsw_idx" ON "ProjectTopic" USING hnsw ("summaryEmbedding" halfvec_cosine_ops);
CREATE INDEX "ProjectDocumentStatement_textDerivedEmbedding_hnsw_idx" ON "ProjectDocumentStatement" USING hnsw ("textDerivedEmbedding" halfvec_cosine_ops);
