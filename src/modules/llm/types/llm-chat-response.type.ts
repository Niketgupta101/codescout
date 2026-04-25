import type { LLMToolCall } from "./llm-message.type";

export type LLMChatResponse = {
  id: string;
  content: string | null;
  toolCalls?: LLMToolCall[];
  finishReason: "stop" | "tool_calls" | "length" | "error";
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};
