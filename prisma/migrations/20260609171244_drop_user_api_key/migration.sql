/*
  Warnings:

  - You are about to drop the `UserApiKey` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."UserApiKey" DROP CONSTRAINT "UserApiKey_userId_fkey";

-- DropIndex
DROP INDEX "public"."CodeFile_summaryEmbedding_hnsw_idx";

-- DropIndex
DROP INDEX "public"."Message_contentEmbedding_hnsw_idx";

-- DropTable
DROP TABLE "public"."UserApiKey";
