export type StoredToolCall = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
};
