import type { LLMProvider } from "./llm-provider.type";
import type { LLMMessage } from "./llm-message.type";
import type { LLMTool } from "./llm-tool.type";
import type { LLMResponseFormat } from "./llm-response-format.type";

export type LLMChatOptions = {
  provider: LLMProvider;
  model: string;
  messages: LLMMessage[];
  tools?: LLMTool[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: LLMResponseFormat;
};
