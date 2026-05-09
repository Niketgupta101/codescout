import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { AgentToolsService } from "./agent-tools.service";
import { ConversationsService } from "../conversations/conversations.service";
import { CodeFileLanguage, SymbolType } from "@prisma/client";
import { LLMService } from "../llm/llm.service";
import { EnvService } from "../env/env.service";
import { PrismaService } from "../../prisma/prisma.service";
import type { LLMProvider } from "../llm/types/llm-provider.type";
import type { LLMMessage } from "../llm/types/llm-message.type";
import type { LLMTool } from "../llm/types/llm-tool.type";
import { AgentQuery } from "./types/agent-query.type";
import { AgentResponse } from "./types/agent-response.type";
import { AgentLLMAnswerToQuery } from "./types/agent-llm-answer-to-query.type";
import { AgentFormatProjectContextOptions } from "./types/agent-format-project-context-options.type";
import { AgentIterationUsage } from "./types/agent-iteration-usage.type";
import { AgentTokenUsage } from "./types/agent-token-usage.type";
import { AgentAnswerGenerationResult } from "./types/agent-answer-generation-result.type";
import { formatProjectContextSection } from "./utils/format-project-context.util";
import { buildAgentSystemPrompt } from "./utils/build-agent-system-prompt.util";
import { buildAnswerGenerationPrompt } from "./utils/build-answer-generation-prompt.util";
import { sumAgentTokenUsage } from "./utils/sum-agent-token-usage.util";

@Injectable()
export class AgentService {
  readonly logger = new Logger(AgentService.name);

  constructor(
    readonly tools: AgentToolsService,
    readonly llmService: LLMService,
    readonly prisma: PrismaService,
    readonly envService: EnvService,
    @Inject(forwardRef(() => ConversationsService))
    readonly conversationsService: ConversationsService,
  ) {}

  _resolveTimeoutMs(requestTimeoutMs: number | undefined): number {
    return requestTimeoutMs ?? this.envService.get("AGENT_TIMEOUT_MS") ?? 180_000;
  }

  /**
   * Execute agent query with tool calling loop
   */
  async query(
    projectId: string,
    request: AgentQuery,
    provider: LLMProvider = "openai",
    model = "gpt-4o-mini",
  ): Promise<AgentResponse> {
    const startTime = Date.now();
    const maxIterations = request.maxIterations ?? 15;
    const timeoutMs = this._resolveTimeoutMs(request.timeoutMs);

    this.logger.log(`Agent query: "${request.query}" (${provider}/${model})`);

    const toolCalls: AgentResponse["toolCalls"] = [];
    const iterationsUsage: AgentIterationUsage[] = [];

    // fetch once per request and reuse for both the research prompt and the answer prompt
    const projectContext = await this._fetchProjectContextForSystemPrompt(projectId);

    const systemPrompt = this._buildSystemPrompt({
      projectId,
      projectContext,
      hasConversationContext: false,
    });

    const messages: LLMMessage[] = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: request.query,
      },
    ];

    let iterations = 0;

    while (iterations < maxIterations) {
      // check timeout
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`Agent timeout after ${timeoutMs}ms`);
      }

      iterations++;
      this.logger.debug(`Iteration ${iterations}/${maxIterations}`);

      // call LLM with function calling
      const response = await this.llmService.chatCompletion({
        provider,
        model,
        messages,
        tools: this._getToolDefinitions(),
        temperature: 0.1,
      });

      // add assistant message to history
      messages.push({
        role: "assistant",
        content: response.content ?? undefined,
        toolCalls: response.toolCalls,
      });

      // check if LLM wants to call tools
      if (response.toolCalls && response.toolCalls.length > 0) {
        this.logger.debug(`LLM requested ${response.toolCalls.length} tool calls`);

        const toolCallIdsForThisIteration: string[] = [];

        // execute each tool call
        for (const toolCall of response.toolCalls) {
          const toolName = toolCall.name;
          const toolArgs = toolCall.arguments;

          this.logger.debug(`Calling tool: ${toolName}(${JSON.stringify(toolArgs)})`);

          // execute tool
          const result = await this._executeTool(projectId, toolName, toolArgs, undefined);

          // record tool call (iteration stamps the loop turn that produced this tool call so token usage can be cross-referenced)
          toolCalls.push({
            id: toolCall.id,
            tool: toolName,
            args: toolArgs,
            result,
            iteration: iterations,
          });

          toolCallIdsForThisIteration.push(toolCall.id);

          // add tool result to messages
          messages.push({
            role: "tool",
            toolResult: {
              toolCallId: toolCall.id,
              content: JSON.stringify(result),
            },
          });
        }

        // record iteration usage now that we know which tool calls came out of this LLM response
        iterationsUsage.push({
          iteration: iterations,
          toolCallIds: toolCallIdsForThisIteration,
          usage: response.usage,
        });

        // continue loop (LLM will process tool results)
        continue;
      }

      // no tool calls - agent has gathered information, now generate final answer
      if (response.content) {
        // record terminal iteration's usage; toolCallIds is empty because the LLM chose to answer instead of calling tools
        iterationsUsage.push({
          iteration: iterations,
          toolCallIds: [],
          usage: response.usage,
        });

        const durationMs = Date.now() - startTime;

        this.logger.log(
          `Agent research complete: ${iterations} iterations, ${toolCalls.length} tool calls, ${durationMs}ms`,
        );
        this.logger.log(`Generating final answer from research findings...`);

        const answerGenerationResult = await this._generateAnswer({
          query: request.query,
          agentFindings: response.content,
          projectContext,
          provider,
          model,
        });

        return this._buildAgentResponse({
          answer: answerGenerationResult.formattedAnswer,
          toolCalls,
          iterations,
          durationMs,
          iterationsUsage,
          answerGenerationUsage: answerGenerationResult.usage,
        });
      }

      // edge case: no content and no tool calls
      throw new Error("LLM returned no content or tool calls");
    }

    throw new Error(`Max iterations (${maxIterations}) reached`);
  }

  /**
   * Execute agent query with conversation context
   */
  async queryWithContext(
    projectId: string,
    request: AgentQuery,
    conversationContext: LLMMessage[] = [],
    conversationId?: string,
    provider: LLMProvider = "openai",
    model = "gpt-4o-mini",
  ): Promise<AgentResponse> {
    const startTime = Date.now();
    const maxIterations = request.maxIterations ?? 15;
    const timeoutMs = this._resolveTimeoutMs(request.timeoutMs);

    this.logger.log(
      `Agent query with context (${conversationContext.length} messages): "${request.query}" (${provider}/${model})`,
    );

    const toolCalls: AgentResponse["toolCalls"] = [];
    const iterationsUsage: AgentIterationUsage[] = [];

    // fetch once per request and reuse for both the research prompt and the answer prompt
    const projectContext = await this._fetchProjectContextForSystemPrompt(projectId);

    const systemPrompt = this._buildSystemPrompt({
      projectId,
      projectContext,
      hasConversationContext: !!conversationId,
    });

    const messages: LLMMessage[] = [
      {
        role: "system",
        content: systemPrompt,
      },
      ...conversationContext, // previous conversation messages
      {
        role: "user",
        content: request.query,
      },
    ];

    let iterations = 0;

    while (iterations < maxIterations) {
      // check timeout
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`Agent timeout after ${timeoutMs}ms`);
      }

      iterations++;
      this.logger.debug(`Iteration ${iterations}/${maxIterations}`);

      // call LLM with function calling
      const response = await this.llmService.chatCompletion({
        provider,
        model,
        messages,
        tools: this._getToolDefinitions(conversationId),
        temperature: 0.1,
      });

      // add assistant message to history
      messages.push({
        role: "assistant",
        content: response.content ?? undefined,
        toolCalls: response.toolCalls,
      });

      // check if LLM wants to call tools
      if (response.toolCalls && response.toolCalls.length > 0) {
        this.logger.debug(`LLM requested ${response.toolCalls.length} tool calls`);

        const toolCallIdsForThisIteration: string[] = [];

        // execute each tool call
        for (const toolCall of response.toolCalls) {
          const toolName = toolCall.name;
          const toolArgs = toolCall.arguments;

          this.logger.debug(`Calling tool: ${toolName}(${JSON.stringify(toolArgs)})`);

          // execute tool
          const result = await this._executeTool(projectId, toolName, toolArgs, conversationId);

          // record tool call (iteration stamps the loop turn that produced this tool call so token usage can be cross-referenced)
          toolCalls.push({
            id: toolCall.id,
            tool: toolName,
            args: toolArgs,
            result,
            iteration: iterations,
          });

          toolCallIdsForThisIteration.push(toolCall.id);

          // add tool result to messages
          messages.push({
            role: "tool",
            toolResult: {
              toolCallId: toolCall.id,
              content: JSON.stringify(result),
            },
          });
        }

        // record iteration usage now that we know which tool calls came out of this LLM response
        iterationsUsage.push({
          iteration: iterations,
          toolCallIds: toolCallIdsForThisIteration,
          usage: response.usage,
        });

        // continue loop (LLM will process tool results)
        continue;
      }

      // no tool calls - agent has gathered information, now generate final answer
      if (response.content) {
        // record terminal iteration's usage; toolCallIds is empty because the LLM chose to answer instead of calling tools
        iterationsUsage.push({
          iteration: iterations,
          toolCallIds: [],
          usage: response.usage,
        });

        const durationMs = Date.now() - startTime;

        this.logger.log(
          `Agent research complete: ${iterations} iterations, ${toolCalls.length} tool calls, ${durationMs}ms`,
        );
        this.logger.log(`Generating final answer from research findings...`);

        const answerGenerationResult = await this._generateAnswer({
          query: request.query,
          agentFindings: response.content,
          projectContext,
          provider,
          model,
        });

        return this._buildAgentResponse({
          answer: answerGenerationResult.formattedAnswer,
          toolCalls,
          iterations,
          durationMs,
          iterationsUsage,
          answerGenerationUsage: answerGenerationResult.usage,
        });
      }

      // edge case: no content and no tool calls
      throw new Error("LLM returned no content or tool calls");
    }

    throw new Error(`Max iterations (${maxIterations}) reached`);
  }

  _buildSystemPrompt({
    projectId,
    projectContext,
    hasConversationContext,
  }: {
    projectId: string;
    projectContext: AgentFormatProjectContextOptions;
    hasConversationContext: boolean;
  }): string {
    return buildAgentSystemPrompt({
      projectId,
      projectContextSection: formatProjectContextSection(projectContext),
      hasConversationContext,
    });
  }

  async _fetchProjectContextForSystemPrompt(projectId: string): Promise<AgentFormatProjectContextOptions> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, summary: true },
    });

    // project deleted or never existed — return an empty shape so the formatter renders nothing instead of throwing
    if (!project) {
      return { projectName: "", projectSummary: null, directories: [] };
    }

    // depth cap is enforced at query time so the formatter doesn't have to filter — keeps the prompt size bounded
    // ordering by depth then path makes the formatted tree natural to read top-down
    const directories = await this.prisma.directory.findMany({
      where: { projectId, depth: { lte: 3 } },
      orderBy: [{ depth: "asc" }, { fullPath: "asc" }],
      take: 50,
      select: { fullPath: true, depth: true, summary: true },
    });

    return {
      projectName: project.name,
      projectSummary: project.summary,
      directories,
    };
  }

  // assembles the public AgentResponse and computes totalUsage from the loop's iterations + the answer-generation call
  // separated so both query() and queryWithContext() return the same shape with no duplicated math
  _buildAgentResponse({
    answer,
    toolCalls,
    iterations,
    durationMs,
    iterationsUsage,
    answerGenerationUsage,
  }: {
    answer: string;
    toolCalls: AgentResponse["toolCalls"];
    iterations: number;
    durationMs: number;
    iterationsUsage: AgentIterationUsage[];
    answerGenerationUsage: AgentTokenUsage;
  }): AgentResponse {
    const totalUsage = sumAgentTokenUsage([
      ...iterationsUsage.map((iterationUsage) => iterationUsage.usage),
      answerGenerationUsage,
    ]);

    return {
      answer,
      toolCalls,
      iterations,
      durationMs,
      iterationsUsage,
      answerGenerationUsage,
      totalUsage,
    };
  }

  /**
   * Generate final answer from agent's research findings.
   * Uses structured outputs to enforce response format.
   */
  async _generateAnswer({
    query,
    agentFindings,
    projectContext,
    provider,
    model,
  }: {
    query: string;
    agentFindings: string;
    projectContext: AgentFormatProjectContextOptions;
    provider: LLMProvider;
    model: string;
  }): Promise<AgentAnswerGenerationResult> {
    const systemPrompt = buildAnswerGenerationPrompt({
      projectName: projectContext.projectName,
      projectSummary: projectContext.projectSummary,
    });

    try {
      const response = await this.llmService.chatCompletion({
        provider,
        model,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: `Question: ${query}

Research findings from codebase:
${agentFindings}

Answer the question based on these findings:`,
          },
        ],
        temperature: 0.1,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "codebase_answer",
            strict: true,
            schema: {
              type: "object",
              properties: {
                answer: {
                  type: "string",
                  description: "Brief, conversational main response",
                },
                details: {
                  type: "array",
                  description: "Additional detail points (always generate)",
                  items: { type: "string" },
                },
                codeSnippets: {
                  type: "array",
                  description: "Code examples (always generate if relevant)",
                  items: {
                    type: "object",
                    properties: {
                      filePath: {
                        type: "string",
                        description: "Path to the file",
                      },
                      code: {
                        type: "string",
                        description: "The code snippet",
                      },
                    },
                    required: ["filePath", "code"],
                    additionalProperties: false,
                  },
                },
                showDetails: {
                  type: "boolean",
                  description: "Should details be displayed for this question?",
                },
                showCode: {
                  type: "boolean",
                  description: "Should code snippets be displayed for this question?",
                },
              },
              required: ["answer", "details", "codeSnippets", "showDetails", "showCode"],
              additionalProperties: false,
            },
          },
        },
      });

      if (!response.content) {
        throw new Error("No response from LLM");
      }

      const parsedAnswer = JSON.parse(response.content) as AgentLLMAnswerToQuery;

      return {
        formattedAnswer: this._formatAnswer(parsedAnswer),
        usage: response.usage,
      };
    } catch (error) {
      this.logger.error("Failed to generate answer", error);
      throw error;
    }
  }

  /**
   * Format structured answer for display with proper markdown.
   * Respects showDetails and showCode flags from LLM.
   */
  _formatAnswer(answer: AgentLLMAnswerToQuery): string {
    let formatted = answer.answer;

    // Add details section with header if showDetails flag is true
    if (answer.showDetails && answer.details && answer.details.length > 0) {
      formatted += "\n\n## Details\n\n";
      formatted += answer.details.map((detail) => `- ${detail}`).join("\n\n");
    }

    // Add code examples section with header if showCode flag is true
    if (answer.showCode && answer.codeSnippets && answer.codeSnippets.length > 0) {
      formatted += "\n\n## Code Examples\n\n";
      for (const snippet of answer.codeSnippets) {
        formatted += `**${snippet.filePath}:**\n\`\`\`typescript\n${snippet.code}\n\`\`\`\n\n`;
      }
    }

    return formatted;
  }

  /**
   * Execute a single tool call
   */
  async _executeTool(
    projectId: string,
    toolName: string,
    args: Record<string, unknown>,
    conversationId?: string,
  ): Promise<unknown> {
    switch (toolName) {
      case "list_files":
        return this.tools.listFiles(projectId, { regex: args.pattern as string | undefined });

      case "read_file":
        return this.tools.readFile(projectId, args.filePath as string);

      case "search_symbols":
        return this.tools.searchSymbols(projectId, {
          name: args.name as string,
          type: args.type as SymbolType | undefined,
        });

      case "search_code":
        return this.tools.searchCode(projectId, {
          pattern: args.pattern as string,
          language: args.language as CodeFileLanguage,
        });

      case "get_file_tree":
        return this.tools.getFileTree(projectId);

      case "get_directory":
        return this.tools.getDirectory(projectId, args.path as string);

      case "search_files":
        return this.tools.searchFiles(
          projectId,
          args.query as string,
          args.documentTypes as string[] | undefined,
          args.topK as number | undefined,
        );

      case "search_conversation_history":
        if (!conversationId) {
          return {
            success: false,
            error: "Conversation history search not available outside a conversation",
          };
        }
        return this.conversationsService.searchHistory(
          conversationId,
          args.query as string,
          args.topK as number | undefined,
        );

      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
        };
    }
  }

  /**
   * Get tool definitions for function calling
   */
  _getToolDefinitions(conversationId?: string): LLMTool[] {
    const baseTools: LLMTool[] = [
      {
        name: "list_files",
        description: 'List all files in the project. Optional pattern filter (e.g., "*.ts", "src/").',
        parameters: {
          pattern: {
            type: "string",
            description: "Optional pattern to filter files",
          },
        },
      },
      {
        name: "read_file",
        description: "Read the full content of a specific file. Returns file path, language, content, and metadata.",
        parameters: {
          filePath: {
            type: "string",
            description: "The path of the file to read",
          },
        },
        required: ["filePath"],
      },
      {
        name: "search_symbols",
        description:
          "Search for symbols (functions, classes, types, etc.) by name. Case-insensitive partial match. Returns symbol name, type, file path, and context.",
        parameters: {
          name: {
            type: "string",
            description: "Symbol name to search for",
          },
          type: {
            type: "string",
            description: "Optional symbol type filter (function, class, interface, type, enum, etc.)",
          },
        },
        required: ["name"],
      },
      {
        name: "search_code",
        description:
          "Search for code using regex pattern. Returns matching files with line numbers and excerpts. Use for finding usage patterns, specific strings, or code structures.",
        parameters: {
          pattern: {
            type: "string",
            description: "Regex pattern to search for",
          },
          language: {
            type: "string",
            description: "Optional language filter (typescript, javascript, markdown, etc.)",
          },
        },
        required: ["pattern"],
      },
      {
        name: "get_file_tree",
        description:
          "Get the hierarchical folder/file structure of the project. Useful for understanding project organization.",
        parameters: {},
      },
      {
        name: "get_directory",
        description: "List files in a specific directory path. Returns direct children only (not nested).",
        parameters: {
          path: {
            type: "string",
            description: "Directory path",
          },
        },
        required: ["path"],
      },
      {
        name: "search_files",
        description:
          "Semantic search for relevant files using natural language query. Returns file paths with summaries and document types. IMPORTANT: Summaries are for discovery only - you MUST call read_file after to get actual content. Use expanded queries with synonyms for better results.",
        parameters: {
          query: {
            type: "string",
            description:
              'Expanded natural language query with synonyms for better vector similarity matching. GOOD: "user registration signup create account flow", BAD: "register". Include multiple related terms in one query.',
          },
          documentTypes: {
            type: "string",
            description:
              "Optional filter by document types: tech_spec, user_stories, meeting_notes, requirements, design_doc, backend_codebase, web_codebase, app_codebase, custom",
          },
          topK: {
            type: "string",
            description: "Number of results to return (default: 10)",
          },
        },
        required: ["query"],
      },
    ];

    // add conversation history search tool if conversationId provided
    if (conversationId) {
      baseTools.push({
        name: "search_conversation_history",
        description:
          'Search previous messages in this conversation for relevant past discussions. Use when user references earlier parts of the conversation (e.g., "what did we discuss about X earlier?", "as you mentioned before").',
        parameters: {
          query: {
            type: "string",
            description:
              'What to search for in conversation history (e.g., "authentication discussion", "earlier solution")',
          },
          topK: {
            type: "string",
            description: "Number of past messages to retrieve (default: 3)",
          },
        },
        required: ["query"],
      });
    }

    return baseTools;
  }
}
