export type AgentResponseToolCall = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
};
