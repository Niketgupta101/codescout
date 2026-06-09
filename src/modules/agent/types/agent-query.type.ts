export type AgentQuery = {
  query: string;
  maxIterations?: number;
  timeoutMs?: number;
  // when true, skip the post-research _generateAnswer LLM call and return the research-agent's raw findings as the answer
  // intended for agentic callers (MCP) where the calling LLM will reformat the response anyway - saves a full LLM round-trip
  skipAnswerFormatting?: boolean;
};
