export type ParsedChunk = {
  content: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};
