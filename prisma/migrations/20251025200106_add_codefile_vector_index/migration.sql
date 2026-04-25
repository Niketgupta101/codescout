-- Add HNSW vector index for fast similarity search on CodeFile
CREATE INDEX IF NOT EXISTS "CodeFile_summaryEmbedding_hnsw_idx"
ON "CodeFile"
USING hnsw ("summaryEmbedding" vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
