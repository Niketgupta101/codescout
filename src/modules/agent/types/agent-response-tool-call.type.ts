export type AgentResponseToolCall = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  // which loop iteration's LLM call produced this tool call; pairs with AgentIterationUsage.toolCallIds for token attribution
  iteration: number;
};
