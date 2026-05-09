// internal bundle returned by _executeToolCallsInParallel
// carries the original tool_call identity + the executed result so the calling loop can record everything in the LLM's original order
export type AgentExecutedToolCallBundle = {
  toolCallId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  result: unknown;
};
