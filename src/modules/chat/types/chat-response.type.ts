export type ChatResponse = {
  answer: string;
  toolCalls: {
    id: string;
    tool: string;
    args: Record<string, unknown>;
    result: unknown;
  }[];
  iterations: number;
  durationMs: number;
  messageId?: string;
};
