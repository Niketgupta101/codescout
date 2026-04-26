import { Injectable } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import type { ChatCompletionOptions } from "./types/chat-completion-options.type";
import type { AnthropicChatCompletionOptions } from "./types/anthropic-chat-completion-options.type";
import type { LLMMessage } from "../llm/types/llm-message.type";
import type { LLMResponseFormat } from "../llm/types/llm-response-format.type";
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

    // structured-output requests (responseFormat=json_schema) are emulated via a forced tool call
    // anthropic's tool use API guarantees the input matches the schema, then we stringify those args back into LLMChatResponse.content
    // so callers (e.g. AgentService._generateAnswer) can keep doing JSON.parse(response.content) without provider-specific branches
    const structuredOutputTool = options.responseFormat
      ? this._buildStructuredOutputTool(options.responseFormat)
      : null;

    const callerTools = options.tools ? this._convertToAnthropicTools(options.tools) : [];

    // structured output and caller tools are mutually exclusive in our usage — _generateAnswer never passes its own tools alongside responseFormat
    // if both are ever needed at once, the caller would need to drop the structured-output guarantee or build a tool that wraps everything
    const anthropicTools = structuredOutputTool ? [structuredOutputTool] : callerTools.length > 0 ? callerTools : undefined;

    const response = await this.anthropic.messages.create({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.1,
      system: options.systemPrompt,
      messages: anthropicMessages,
      tools: anthropicTools,
      // forcing tool_choice ensures Claude must call the structured-output tool — it cannot return free text
      ...(structuredOutputTool ? { tool_choice: { type: "tool", name: structuredOutputTool.name } } : {}),
    });

    if (structuredOutputTool) {
      return this._convertFromStructuredOutputResponse(response);
    }

    return this._convertFromAnthropicResponse(response);
  }

  _buildStructuredOutputTool(responseFormat: LLMResponseFormat): Anthropic.Tool {
    return {
      name: responseFormat.json_schema.name,
      description: `Return the structured response matching the ${responseFormat.json_schema.name} schema.`,
      input_schema: responseFormat.json_schema.schema as Anthropic.Tool.InputSchema,
    };
  }

  _convertFromStructuredOutputResponse(response: Anthropic.Message): LLMChatResponse {
    const toolUseBlock = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");

    // tool_choice forced the call so this should always be present, but guard anyway in case the API returns an unexpected shape
    if (!toolUseBlock) {
      throw new Error("Anthropic returned no tool_use block despite forced tool_choice for structured output");
    }

    return {
      id: response.id,
      content: JSON.stringify(toolUseBlock.input),
      finishReason: "stop",
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
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
