// mutable counter passed through the indexing flow; helpers fold OpenAI usage into it as each call returns
// embeddingInputTokens is tracked separately because embeddings are billed at a different per-million rate than chat completions
export type IndexingTokenAccumulator = {
  fileSummaryInputTokens: number;
  fileSummaryOutputTokens: number;
  fileSummaryCallCount: number;

  fileEmbeddingInputTokens: number;
  fileEmbeddingCallCount: number;

  directorySummaryInputTokens: number;
  directorySummaryOutputTokens: number;
  directorySummaryCallCount: number;

  projectSummaryInputTokens: number;
  projectSummaryOutputTokens: number;
  projectSummaryCallCount: number;
};
