import { Injectable } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import type { ChatCompletionOptions } from "./types/chat-completion-options.type";
import type { AnthropicChatCompletionOptions } from "./types/anthropic-chat-completion-options.type";
import type { LLMMessage } from "../llm/types/llm-message.type";
import type { LLMTool } from "../llm/types/llm-tool.type";
import type { LLMChatResponse } from "../llm/types/llm-chat-response.type";
import { EnvService } from "../env/env.service";

@Injectable()
export class AnthropicService {
  readonly anthropic: Anthropic;

  constructor(readonly envService: EnvService) {
    this.anthropic = new Anthropic({ apiKey: this.envService.get("ANTHROPIC_API_KEY") });
  }

  async createMessage(options: ChatCompletionOptions): Promise<Anthropic.Message> {
    if (!this.anthropic) {
      throw new Error("Anthropic API key not configured");
    }

    return this.anthropic.messages.create({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.1,
      system: options.system,
      messages: options.messages,
      tools: options.tools,
    });
  }

  async chatCompletion(options: AnthropicChatCompletionOptions): Promise<LLMChatResponse> {
    const anthropicMessages = this._convertToAnthropicMessages(options.messages);
    const anthropicTools = options.tools ? this._convertToAnthropicTools(options.tools) : undefined;

    const response = await this.anthropic.messages.create({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.1,
      system: options.systemPrompt,
      messages: anthropicMessages,
      tools: anthropicTools,
    });

    return this._convertFromAnthropicResponse(response);
  }

  _convertToAnthropicMessages(messages: LLMMessage[]): Anthropic.MessageParam[] {
    const anthropicMessages: Anthropic.MessageParam[] = [];

    for (const message of messages) {
      // skip system messages (handled separately in system parameter)
      if (message.role === "system") {
        continue;
      }

      if (message.role === "user") {
        anthropicMessages.push({
          role: "user",
          content: message.content ?? "",
        });
      } else if (message.role === "assistant") {
        const content: (Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam)[] = [];

        if (message.content) {
          content.push({
            type: "text",
            text: message.content,
          });
        }

        if (message.toolCalls && message.toolCalls.length > 0) {
          for (const toolCall of message.toolCalls) {
            content.push({
              type: "tool_use",
              id: toolCall.id,
              name: toolCall.name,
              input: toolCall.arguments,
            });
          }
        }

        anthropicMessages.push({
          role: "assistant",
          content,
        });
      } else if (message.role === "tool" && message.toolResult) {
        anthropicMessages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: message.toolResult.toolCallId,
              content: message.toolResult.content,
            },
          ],
        });
      }
    }

    return anthropicMessages;
  }

  _convertToAnthropicTools(tools: LLMTool[]): Anthropic.Tool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: "object",
        properties: tool.parameters,
        required: tool.required ?? [],
      } as Anthropic.Tool.InputSchema,
    }));
  }

  _convertFromAnthropicResponse(response: Anthropic.Message): LLMChatResponse {
    let textContent = "";
    const toolCalls = [];

    for (const block of response.content) {
      if (block.type === "text") {
        textContent += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        });
      }
    }

    return {
      id: response.id,
      content: textContent || null,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: response.stop_reason === "tool_use" ? "tool_calls" : "stop",
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }
}
