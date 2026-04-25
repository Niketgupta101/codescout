/*
  Warnings:

  - Made the column `type` on table `Repository` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "public"."Conversation_projectId_idx";

-- DropIndex
DROP INDEX "public"."Document_projectId_idx";

-- DropIndex
DROP INDEX "public"."Document_status_idx";

-- DropIndex
DROP INDEX "public"."Message_conversationId_createdAt_idx";

-- DropIndex
DROP INDEX "public"."Message_conversationId_idx";

-- DropIndex
DROP INDEX "public"."Project_name_idx";

-- DropIndex
DROP INDEX "public"."Repository_projectId_idx";

-- DropIndex
DROP INDEX "public"."Repository_status_idx";

-- AlterTable
ALTER TABLE "CodeFile" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'openai',
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "documentType" SET DEFAULT 'custom';

-- AlterTable
ALTER TABLE "Message" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Repository" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "type" SET NOT NULL,
ALTER COLUMN "type" SET DEFAULT 'custom';

-- AlterTable
ALTER TABLE "Symbol" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;
