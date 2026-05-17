export type ChatRequest = {
  query: string;
  maxIterations?: number;
  timeoutMs?: number;
  includeLastNMessages?: number;
  // forwarded to AgentQuery; see agent-query.type.ts for semantics
  skipAnswerFormatting?: boolean;
};
