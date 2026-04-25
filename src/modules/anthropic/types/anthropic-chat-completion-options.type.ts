import type { LLMMessage } from "../../llm/types/llm-message.type";
import type { LLMTool } from "../../llm/types/llm-tool.type";

export type AnthropicChatCompletionOptions = {
  model: string;
  messages: LLMMessage[];
  tools?: LLMTool[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
};
