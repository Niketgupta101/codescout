import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { GenerateEmbeddingOptions } from "./types/generate-embedding-options.type";
import { GenerateSummaryOptions } from "./types/generate-file-summary-options.type";
import { OpenAiGenerateDirectorySummaryOptions } from "./types/openai-generate-directory-summary-options.type";
import { OpenAiGenerateProjectSummaryOptions } from "./types/openai-generate-project-summary-options.type";
import { OpenAiTokenUsage } from "./types/openai-token-usage.type";
import type { OpenAIChatCompletionOptions } from "./types/openai-chat-completion-options.type";
import type { LLMMessage } from "../llm/types/llm-message.type";
import type { LLMTool } from "../llm/types/llm-tool.type";
import type { LLMChatResponse } from "../llm/types/llm-chat-response.type";

// exported so IndexingCostService can tokenize the exact prompt used at indexing time
export const SUMMARY_SYSTEM_PROMPT =
  "You are a helpful assistant that generates concise file summaries with embedded tables of contents.";

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

  async generateEmbedding({
    input,
    model = "text-embedding-3-large",
  }: GenerateEmbeddingOptions): Promise<{ embedding: number[]; usage: OpenAiTokenUsage }> {
    const response = await this.openai.embeddings.create({
      input,
      model,
    });

    return {
      embedding: response.data[0].embedding,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: 0,
      },
    };
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
    model = "gpt-4o-mini",
  }: GenerateSummaryOptions): Promise<{ summary: string; usage: OpenAiTokenUsage }> {
    const prompt = this._buildSummaryPrompt(language, filePath, content);

    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: SUMMARY_SYSTEM_PROMPT,
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

    return {
      summary,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  async generateDirectorySummary({
    projectName,
    directoryFullPath,
    fileSummaries,
    childDirectorySummaries,
    model = "gpt-4o-mini",
  }: OpenAiGenerateDirectorySummaryOptions): Promise<{ summary: string; usage: OpenAiTokenUsage }> {
    const prompt = this._buildDirectorySummaryPrompt({
      projectName,
      directoryFullPath,
      fileSummaries,
      childDirectorySummaries,
    });

    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 1024,
    });

    const summary = response.choices[0]?.message?.content;

    if (!summary) {
      throw new Error("No directory summary generated from OpenAI");
    }

    return {
      summary,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  async generateProjectSummary({
    projectName,
    topLevelDirectorySummaries,
    model = "gpt-4o-mini",
  }: OpenAiGenerateProjectSummaryOptions): Promise<{ summary: string; usage: OpenAiTokenUsage }> {
    const prompt = this._buildProjectSummaryPrompt({ projectName, topLevelDirectorySummaries });

    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 1024,
    });

    const summary = response.choices[0]?.message?.content;

    if (!summary) {
      throw new Error("No project summary generated from OpenAI");
    }

    return {
      summary,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  _buildDirectorySummaryPrompt({
    projectName,
    directoryFullPath,
    fileSummaries,
    childDirectorySummaries,
  }: Omit<OpenAiGenerateDirectorySummaryOptions, "model">): string {
    const filesSection =
      fileSummaries.length > 0
        ? `Files directly in this directory:\n${fileSummaries
            .map((file) => `- ${this._lastPathSegment(file.fullPath)}: ${file.summary}`)
            .join("\n\n")}\n\n`
        : "";

    const childDirectoriesSection =
      childDirectorySummaries.length > 0
        ? `Subdirectories:\n${childDirectorySummaries
            .map((directory) => `- ${this._lastPathSegment(directory.fullPath)}/: ${directory.summary}`)
            .join("\n\n")}\n\n`
        : "";

    return `Summarize this directory in the ${projectName} codebase.

Path: ${directoryFullPath}/

${filesSection}${childDirectoriesSection}Write 2-3 sentences covering:
1. What this directory is responsible for
2. How its files and subdirectories work together

Keep it under 150 words.`;
  }

  _buildProjectSummaryPrompt({
    projectName,
    topLevelDirectorySummaries,
  }: Omit<OpenAiGenerateProjectSummaryOptions, "model">): string {
    const directoriesSection = topLevelDirectorySummaries
      .map((directory) => `- ${directory.fullPath}/: ${directory.summary}`)
      .join("\n\n");

    return `Summarize this codebase.

Project name: ${projectName}

Top-level directories:
${directoriesSection}

Write 3-4 sentences covering:
1. What the project is and what it does
2. Key technologies and domain
3. Overall architecture shape

Keep it under 250 words.`;
  }

  _lastPathSegment(fullPath: string): string {
    const segments = fullPath.split("/");
    return segments[segments.length - 1] ?? fullPath;
  }

  _buildSummaryPrompt(language: string, filePath: string, content: string): string {
    // gpt-4o-mini handles 128K tokens of context — full file content is sent without truncation
    // pathologically large files are filtered upstream in the indexing pipeline
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
${content}
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
${content}
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
${content}
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
${content}
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
${content}
\`\`\`

Keep the summary under 300 words.`;
  }
}
