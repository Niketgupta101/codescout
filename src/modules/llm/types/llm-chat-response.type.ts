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
    // subset of promptTokens that hit the provider's prompt cache (openai automatic, anthropic explicit cache_control)
    // 0 when the prompt is below the cache size threshold or no prefix matched; useful for measuring cache effectiveness
    cachedPromptTokens: number;
  };
};
