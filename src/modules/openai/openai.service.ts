import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { GenerateSummaryOptions } from "./types/generate-file-summary-options.type";
import { GenerateEmbeddingOptions } from "./types/generate-embedding-options.type";
import type { OpenAIChatCompletionOptions } from "./types/openai-chat-completion-options.type";
import type { LLMMessage } from "../llm/types/llm-message.type";
import type { LLMTool } from "../llm/types/llm-tool.type";
import type { LLMChatResponse } from "../llm/types/llm-chat-response.type";

@Injectable()
export class OpenAIService {
  readonly openai: OpenAI;

  constructor(readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }
    this.openai = new OpenAI({ apiKey });
  }

  async generateEmbedding({ input, model = "text-embedding-3-small" }: GenerateEmbeddingOptions): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      input,
      model,
    });

    return response.data[0].embedding;
  }

  async chatCompletion(options: OpenAIChatCompletionOptions): Promise<LLMChatResponse> {
    const openaiMessages = this._convertToOpenAIMessages(options.messages, options.systemPrompt);
    const openaiTools = options.tools ? this._convertToOpenAITools(options.tools) : undefined;

    const response = await this.openai.chat.completions.create({
      model: options.model,
      messages: openaiMessages,
      tools: openaiTools,
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens,
      response_format: options.responseFormat
        ? {
            type: options.responseFormat.type,
            json_schema: options.responseFormat.json_schema,
          }
        : undefined,
    });

    return this._convertFromOpenAIResponse(response);
  }

  _convertToOpenAIMessages(
    messages: LLMMessage[],
    systemPrompt?: string,
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (systemPrompt) {
      openaiMessages.push({ role: "system", content: systemPrompt });
    }

    for (const message of messages) {
      if (message.role === "system") {
        openaiMessages.push({ role: "system", content: message.content ?? "" });
      } else if (message.role === "user") {
        openaiMessages.push({ role: "user", content: message.content ?? "" });
      } else if (message.role === "assistant") {
        const assistantMessage: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
          role: "assistant",
          content: message.content ?? null,
        };

        if (message.toolCalls && message.toolCalls.length > 0) {
          assistantMessage.tool_calls = message.toolCalls.map((toolCall) => ({
            id: toolCall.id,
            type: "function" as const,
            function: {
              name: toolCall.name,
              arguments: JSON.stringify(toolCall.arguments),
            },
          }));
        }

        openaiMessages.push(assistantMessage);
      } else if (message.role === "tool" && message.toolResult) {
        openaiMessages.push({
          role: "tool",
          tool_call_id: message.toolResult.toolCallId,
          content: message.toolResult.content,
        });
      }
    }

    return openaiMessages;
  }

  _convertToOpenAITools(tools: LLMTool[]): OpenAI.Chat.ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: "object",
          properties: tool.parameters,
          required: tool.required ?? [],
        },
      },
    }));
  }

  _convertFromOpenAIResponse(response: OpenAI.Chat.ChatCompletion): LLMChatResponse {
    const choice = response.choices[0];
    const message = choice?.message;

    const toolCalls = message?.tool_calls
      ?.filter((toolCall) => toolCall.type === "function")
      .map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: JSON.parse(toolCall.function.arguments) as Record<string, unknown>,
      }));

    return {
      id: response.id,
      content: message?.content ?? null,
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: choice?.finish_reason === "tool_calls" ? "tool_calls" : "stop",
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
    };
  }

  async generateFileSummary({
    content,
    language,
    filePath,
    model = "o4-mini",
  }: GenerateSummaryOptions): Promise<string> {
    const prompt = this._buildSummaryPrompt(language, filePath, content);

    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that generates concise file summaries with embedded tables of contents.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.1,
      max_tokens: 8096,
    });

    const summary = response.choices[0]?.message?.content;
    if (!summary) {
      throw new Error("No summary generated from OpenAI");
    }

    return summary;
  }

  _buildSummaryPrompt(language: string, filePath: string, content: string): string {
    const truncatedContent = content.length > 100000 ? content.substring(0, 100000) + "..." : content;

    if (language === "typescript" || language === "javascript" || language === "tsx" || language === "jsx") {
      const isReact = language === "tsx" || language === "jsx";

      return `Generate a concise summary for this ${isReact ? "React" : ""} code file.

File: ${filePath}

Format your response as:
1. Brief description (2-3 sentences) of what this file does
2. Contents section listing main code elements:
   - ${isReact ? "Components (with main props/hooks)" : "Classes (with main methods)"}
   - Functions${isReact ? "/Hooks" : ""}
   - Interfaces/Types
   - Constants

File content:
\`\`\`${language}
${truncatedContent}
\`\`\`

Keep the summary under 300 words.`;
    }

    if (language === "csv") {
      return `Generate a concise summary for this CSV file containing user stories.

File: ${filePath}

Format your response as:
1. Brief description (2-3 sentences) of what this file contains
2. Contents section listing:
   - Epic names
   - Main user story themes

File content:
\`\`\`
${truncatedContent}
\`\`\`

Keep the summary under 300 words.`;
    }

    if (language === "markdown") {
      return `Generate a concise summary for this Markdown document.

File: ${filePath}

Format your response as:
1. Brief description (2-3 sentences) of what this document covers
2. Contents section listing:
   - Main sections/headings
   - Key topics

File content:
\`\`\`markdown
${truncatedContent}
\`\`\`

Keep the summary under 300 words.`;
    }

    if (language === "pdf") {
      return `Generate a concise summary for this PDF document.

File: ${filePath}

Format your response as:
1. Brief description (2-3 sentences) of what this document covers
2. Contents section listing:
   - Main sections/topics
   - Key information

File content:
\`\`\`
${truncatedContent}
\`\`\`

Keep the summary under 300 words.`;
    }

    // generic fallback
    return `Generate a concise summary for this file.

File: ${filePath}
Type: ${language}

Format your response as:
1. Brief description (2-3 sentences)
2. Contents section listing main elements

File content:
\`\`\`
${truncatedContent}
\`\`\`

Keep the summary under 300 words.`;
  }
}
