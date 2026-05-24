-- drop the unused context column from Symbol
-- context historically held filePath duplicates for code symbols and weak hints for markdown rows;
-- query-time disambiguation already works off (name, type, filePath, startLine, endLine)
ALTER TABLE "Symbol" DROP COLUMN "context";

-- delete markdown heading symbols (file summaries via codeFileSearch handle "find docs about X" better)
DELETE FROM "Symbol"
WHERE type = 'heading'
  AND "codeFileId" IN (SELECT id FROM "CodeFile" WHERE language = 'markdown');

-- delete markdown keyword term symbols (extracted stopwords like "for", "see", "github" were pure noise)
DELETE FROM "Symbol"
WHERE type = 'term'
  AND "codeFileId" IN (SELECT id FROM "CodeFile" WHERE language = 'markdown');

-- delete parent-class shortcut rows the indexer historically emitted per-method (no line range, duplicated by the real class declaration row)
DELETE FROM "Symbol"
WHERE type = 'class'
  AND "startLine" IS NULL;

-- pgvector indexes recreated explicitly (Prisma's introspection doesn't track them)
DROP INDEX IF EXISTS "CodeFile_summaryEmbedding_hnsw_idx";
CREATE INDEX "CodeFile_summaryEmbedding_hnsw_idx" ON "CodeFile" USING hnsw ("summaryEmbedding" halfvec_cosine_ops);

DROP INDEX IF EXISTS "Message_contentEmbedding_hnsw_idx";
CREATE INDEX "Message_contentEmbedding_hnsw_idx" ON "Message" USING hnsw ("contentEmbedding" halfvec_cosine_ops);
