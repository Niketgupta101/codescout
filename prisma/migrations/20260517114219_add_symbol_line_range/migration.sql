-- AlterTable
ALTER TABLE "Symbol" ADD COLUMN     "endLine" INTEGER,
ADD COLUMN     "startLine" INTEGER;

-- prisma's introspection wants to drop the hnsw indexes because they aren't in the schema; recreate them so vector search keeps working
DROP INDEX IF EXISTS "public"."CodeFile_summaryEmbedding_hnsw_idx";
DROP INDEX IF EXISTS "public"."Message_contentEmbedding_hnsw_idx";

CREATE INDEX "CodeFile_summaryEmbedding_hnsw_idx"
  ON "CodeFile"
  USING hnsw ("summaryEmbedding" halfvec_cosine_ops);

CREATE INDEX "Message_contentEmbedding_hnsw_idx"
  ON "Message"
  USING hnsw ("contentEmbedding" halfvec_cosine_ops);
