-- Add HNSW vector index for fast similarity search
CREATE INDEX IF NOT EXISTS "Node_summaryEmbedding_hnsw_idx"
ON "Node"
USING hnsw ("summaryEmbedding" vector_cosine_ops)
WITH (m = 16, ef_construction = 64);