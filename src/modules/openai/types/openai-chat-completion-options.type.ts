import type { LLMMessage } from "../../llm/types/llm-message.type";
import type { LLMTool } from "../../llm/types/llm-tool.type";
import type { LLMResponseFormat } from "../../llm/types/llm-response-format.type";

export type OpenAIChatCompletionOptions = {
  model: string;
  messages: LLMMessage[];
  tools?: LLMTool[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: LLMResponseFormat;
};
