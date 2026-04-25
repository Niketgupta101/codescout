-- switch from text-embedding-3-small (vector(1536)) to text-embedding-3-large (halfvec(3072))
-- halfvec stores 16-bit floats, allowing HNSW indexes up to 4000 dims with negligible cosine-similarity precision loss
-- existing 1536-dim embeddings are dropped — affected rows must be re-indexed to repopulate

-- drop existing HNSW indexes (vector_cosine_ops cannot be reused for halfvec)
DROP INDEX IF EXISTS "CodeFile_summaryEmbedding_hnsw_idx";
DROP INDEX IF EXISTS "Message_contentEmbedding_hnsw_idx";

-- replace columns; the old 1536-dim data is incompatible with the new 3072-dim type
ALTER TABLE "CodeFile" DROP COLUMN IF EXISTS "summaryEmbedding";
ALTER TABLE "CodeFile" ADD COLUMN "summaryEmbedding" halfvec(3072);

ALTER TABLE "Message" DROP COLUMN IF EXISTS "contentEmbedding";
ALTER TABLE "Message" ADD COLUMN "contentEmbedding" halfvec(3072);

-- recreate HNSW indexes using halfvec_cosine_ops
CREATE INDEX "CodeFile_summaryEmbedding_hnsw_idx"
  ON "CodeFile"
  USING hnsw ("summaryEmbedding" halfvec_cosine_ops);

CREATE INDEX "Message_contentEmbedding_hnsw_idx"
  ON "Message"
  USING hnsw ("contentEmbedding" halfvec_cosine_ops);
