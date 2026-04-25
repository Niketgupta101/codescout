export type RepositoryIndexCostEstimate = {
  totalFiles: number;
  filesByLanguage: { language: string; count: number }[];
  filesSkipped: { path: string; reason: string }[];

  tokens: {
    summaryInputExact: number;
    summaryOutputEstimated: number;
    embeddingInputEstimated: number;
  };

  cost: {
    summaryInput: number;
    summaryOutputEstimated: number;
    embeddingEstimated: number;
    total: number;
  };

  pricing: {
    summaryModel: string;
    summaryInputPerMillion: number;
    summaryOutputPerMillion: number;
    embeddingModel: string;
    embeddingInputPerMillion: number;
    quotedAt: string;
  };

  notes: string[];
};
