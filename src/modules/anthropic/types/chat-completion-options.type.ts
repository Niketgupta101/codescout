import type Anthropic from "@anthropic-ai/sdk";

export type ChatCompletionOptions = {
  model: string;
  messages: Anthropic.MessageParam[];
  tools?: Anthropic.Tool[];
  system?: string;
  maxTokens?: number;
  temperature?: number;
};
