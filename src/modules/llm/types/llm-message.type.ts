export type LLMMessageRole = "system" | "user" | "assistant" | "tool";

export type LLMToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type LLMToolResult = {
  toolCallId: string;
  content: string;
};

export type LLMMessage = {
  role: LLMMessageRole;
  content?: string;
  toolCalls?: LLMToolCall[];
  toolResult?: LLMToolResult;
};
