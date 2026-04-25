export type ChatRequest = {
  query: string;
  maxIterations?: number;
  timeoutMs?: number;
  includeLastNMessages?: number;
};
