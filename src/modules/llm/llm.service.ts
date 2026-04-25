import { Injectable } from "@nestjs/common";
import { OpenAIService } from "../openai/openai.service";
import { AnthropicService } from "../anthropic/anthropic.service";
import type { LLMChatOptions } from "./types/llm-chat-options.type";
import type { LLMChatResponse } from "./types/llm-chat-response.type";

@Injectable()
export class LLMService {
  constructor(
    readonly openaiService: OpenAIService,
    readonly anthropicService: AnthropicService,
  ) {}

  async chatCompletion(options: LLMChatOptions): Promise<LLMChatResponse> {
    if (options.provider === "openai") {
      return this.openaiService.chatCompletion(options);
    } else if (options.provider === "anthropic") {
      return this.anthropicService.chatCompletion(options);
    } else {
      throw new Error(`Unsupported provider ${options.provider as string}`);
    }
  }
}
