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
import { AgentExecutedToolCallBundle } from "./types/agent-executed-tool-call-bundle.type";
import type { LLMToolCall } from "../llm/types/llm-message.type";
import { formatProjectContextSection } from "./utils/format-project-context.util";
import { buildAgentSystemPrompt } from "./utils/build-agent-system-prompt.util";
import { buildAnswerGenerationPrompt } from "./utils/build-answer-generation-prompt.util";
import { sumAgentTokenUsage } from "./utils/sum-agent-token-usage.util";

// placeholder usage record for runs that skip the post-research analyst LLM call
const ZERO_TOKEN_USAGE: AgentTokenUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  cachedPromptTokens: 0,
};

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

  // resolves max output tokens per LLM call: env override > 16384 default
  // 16384 is the safe ceiling across providers we support (sonnet 4.5 supports 64k but openai gpt-4o family caps at 16k)
  // max_tokens is a cap not a charge, so bumping it has no cost — only api errors when the value exceeds the model's hard limit
  _resolveMaxOutputTokens(): number {
    return this.envService.get("AGENT_MAX_OUTPUT_TOKENS") ?? 16384;
  }

  // emits a warning when the LLM stopped because it hit max_tokens — that means the answer was clipped and the user got an incomplete response
  // raise AGENT_MAX_OUTPUT_TOKENS in env vars to fix
  _warnIfTruncated(stage: "research" | "answer-generation", finishReason: string, maxOutputTokens: number): void {
    if (finishReason === "length") {
      this.logger.warn(
        `LLM ${stage} response truncated at ${maxOutputTokens} output tokens — raise AGENT_MAX_OUTPUT_TOKENS to fix`,
      );
    }
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
    const maxOutputTokens = this._resolveMaxOutputTokens();

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
        maxTokens: maxOutputTokens,
      });

      this._warnIfTruncated("research", response.finishReason, maxOutputTokens);

      // add assistant message to history
      messages.push({
        role: "assistant",
        content: response.content ?? undefined,
        toolCalls: response.toolCalls,
      });

      // check if LLM wants to call tools
      if (response.toolCalls && response.toolCalls.length > 0) {
        this.logger.debug(`LLM requested ${response.toolCalls.length} tool calls`);

        // execute tool calls in parallel — independent reads/searches don't need to wait on each other
        // Promise.all preserves array order so the resolved bundles line up with the LLM's original tool_calls order
        const executedToolCallBundles = await this._executeToolCallsInParallel({
          projectId,
          toolCalls: response.toolCalls,
          conversationId: undefined,
        });

        const toolCallIdsForThisIteration: string[] = [];

        for (const bundle of executedToolCallBundles) {
          // record tool call (iteration stamps the loop turn that produced this tool call so token usage can be cross-referenced)
          toolCalls.push({
            id: bundle.toolCallId,
            tool: bundle.toolName,
            args: bundle.toolArgs,
            result: bundle.result,
            iteration: iterations,
          });

          toolCallIdsForThisIteration.push(bundle.toolCallId);

          // add tool result to messages — must stay in original order so the LLM sees them in the order it asked
          messages.push({
            role: "tool",
            toolResult: {
              toolCallId: bundle.toolCallId,
              content: JSON.stringify(bundle.result),
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

        return this._finalizeAgentRun({
          query: request.query,
          researchContent: response.content,
          skipAnswerFormatting: request.skipAnswerFormatting ?? false,
          projectContext,
          provider,
          model,
          toolCalls,
          iterations,
          durationMs,
          iterationsUsage,
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
    const maxOutputTokens = this._resolveMaxOutputTokens();

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
        maxTokens: maxOutputTokens,
      });

      this._warnIfTruncated("research", response.finishReason, maxOutputTokens);

      // add assistant message to history
      messages.push({
        role: "assistant",
        content: response.content ?? undefined,
        toolCalls: response.toolCalls,
      });

      // check if LLM wants to call tools
      if (response.toolCalls && response.toolCalls.length > 0) {
        this.logger.debug(`LLM requested ${response.toolCalls.length} tool calls`);

        // execute tool calls in parallel — independent reads/searches don't need to wait on each other
        // Promise.all preserves array order so the resolved bundles line up with the LLM's original tool_calls order
        const executedToolCallBundles = await this._executeToolCallsInParallel({
          projectId,
          toolCalls: response.toolCalls,
          conversationId,
        });

        const toolCallIdsForThisIteration: string[] = [];

        for (const bundle of executedToolCallBundles) {
          // record tool call (iteration stamps the loop turn that produced this tool call so token usage can be cross-referenced)
          toolCalls.push({
            id: bundle.toolCallId,
            tool: bundle.toolName,
            args: bundle.toolArgs,
            result: bundle.result,
            iteration: iterations,
          });

          toolCallIdsForThisIteration.push(bundle.toolCallId);

          // add tool result to messages — must stay in original order so the LLM sees them in the order it asked
          messages.push({
            role: "tool",
            toolResult: {
              toolCallId: bundle.toolCallId,
              content: JSON.stringify(bundle.result),
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

        return this._finalizeAgentRun({
          query: request.query,
          researchContent: response.content,
          skipAnswerFormatting: request.skipAnswerFormatting ?? false,
          projectContext,
          provider,
          model,
          toolCalls,
          iterations,
          durationMs,
          iterationsUsage,
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
  // decides whether to run the post-research formatter or return raw findings directly
  // raw-findings mode exists for agentic callers (MCP) where the calling LLM will reformat anyway — running _generateAnswer for them duplicates work
  async _finalizeAgentRun({
    query,
    researchContent,
    skipAnswerFormatting,
    projectContext,
    provider,
    model,
    toolCalls,
    iterations,
    durationMs,
    iterationsUsage,
  }: {
    query: string;
    researchContent: string;
    skipAnswerFormatting: boolean;
    projectContext: AgentFormatProjectContextOptions;
    provider: LLMProvider;
    model: string;
    toolCalls: AgentResponse["toolCalls"];
    iterations: number;
    durationMs: number;
    iterationsUsage: AgentIterationUsage[];
  }): Promise<AgentResponse> {
    if (skipAnswerFormatting) {
      this.logger.log(`Skipping _generateAnswer (skipAnswerFormatting=true) — returning raw research findings`);

      return this._buildAgentResponse({
        answer: researchContent,
        toolCalls,
        iterations,
        durationMs,
        iterationsUsage,
        answerGenerationUsage: ZERO_TOKEN_USAGE,
      });
    }

    this.logger.log(`Generating final answer from research findings...`);

    const answerGenerationResult = await this._generateAnswer({
      query,
      agentFindings: researchContent,
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

    // log cache hit rate so we can see prompt caching working in production
    // ratio of 0 means no cache hit (cold first call or below provider threshold); a healthy steady-state should sit above 0.5
    const cacheHitRate = totalUsage.promptTokens > 0 ? totalUsage.cachedPromptTokens / totalUsage.promptTokens : 0;
    this.logger.log(
      `Token usage: ${totalUsage.totalTokens} total (${totalUsage.promptTokens} prompt, ${totalUsage.completionTokens} completion, ${totalUsage.cachedPromptTokens} cached, ${(cacheHitRate * 100).toFixed(1)}% hit rate)`,
    );

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

    const maxOutputTokens = this._resolveMaxOutputTokens();

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
        maxTokens: maxOutputTokens,
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

      this._warnIfTruncated("answer-generation", response.finishReason, maxOutputTokens);

      if (!response.content) {
        throw new Error("No response from LLM");
      }

      // anthropic's tool_use input_schema is a hint, not strictly enforced — claude can return arrays as strings, drop fields, etc.
      // validating + coercing here means a malformed shape produces a usable answer instead of crashing the whole agent run
      const parsedAnswer = this._parseAndCoerceAgentLLMAnswer(response.content);

      return {
        formattedAnswer: this._formatAnswer(parsedAnswer),
        usage: response.usage,
      };
    } catch (error) {
      this.logger.error("Failed to generate answer", error);
      throw error;
    }
  }

  // parses the raw structured-output JSON and coerces each field to its expected shape
  // logs a warning when coercion was needed so we can spot providers misbehaving without breaking the request
  _parseAndCoerceAgentLLMAnswer(rawJsonString: string): AgentLLMAnswerToQuery {
    const raw = JSON.parse(rawJsonString) as Record<string, unknown>;

    const answer = typeof raw.answer === "string" ? raw.answer : "";

    // details: must be string[]; coerce a single string to one-element array, anything else to empty
    let details: string[];
    if (Array.isArray(raw.details)) {
      details = raw.details.filter((entry): entry is string => typeof entry === "string");
    } else if (typeof raw.details === "string") {
      this.logger.warn(`Structured output returned 'details' as string instead of string[]; wrapping`);
      details = [raw.details];
    } else {
      if (raw.details != null) {
        this.logger.warn(`Structured output returned 'details' as ${typeof raw.details}; defaulting to empty array`);
      }
      details = [];
    }

    // codeSnippets: must be {filePath, code}[]; drop entries that don't match
    const codeSnippets = Array.isArray(raw.codeSnippets)
      ? raw.codeSnippets.filter(
          (entry): entry is { filePath: string; code: string } =>
            entry != null &&
            typeof entry === "object" &&
            typeof (entry as Record<string, unknown>).filePath === "string" &&
            typeof (entry as Record<string, unknown>).code === "string",
        )
      : [];

    if (raw.codeSnippets != null && !Array.isArray(raw.codeSnippets)) {
      this.logger.warn(`Structured output returned 'codeSnippets' as ${typeof raw.codeSnippets}; defaulting to empty`);
    }

    // boolean flags default to safe values when missing or wrong type
    const showDetails = typeof raw.showDetails === "boolean" ? raw.showDetails : details.length > 0;
    const showCode = typeof raw.showCode === "boolean" ? raw.showCode : false;

    return { answer, details, codeSnippets, showDetails, showCode };
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

  // executes every tool call from one LLM iteration in parallel and returns the bundles in the LLM's original order
  // Promise.all preserves array order even when individual promises resolve out of order, which is important so the LLM sees tool results in the order it requested them
  async _executeToolCallsInParallel({
    projectId,
    toolCalls,
    conversationId,
  }: {
    projectId: string;
    toolCalls: LLMToolCall[];
    conversationId: string | undefined;
  }): Promise<AgentExecutedToolCallBundle[]> {
    // dedup identical (toolName + args) calls within a single iteration
    // the LLM sometimes issues N parallel reads of the same file when N symbols live there; without dedup the
    // file content lands in conversation N times and compounds across iterations
    const dedupKeyByIndex = toolCalls.map((toolCall) => `${toolCall.name}:${JSON.stringify(toolCall.arguments)}`);

    const firstIndexByKey = new Map<string, number>();
    dedupKeyByIndex.forEach((key, idx) => {
      if (!firstIndexByKey.has(key)) {
        firstIndexByKey.set(key, idx);
      }
    });

    // execute one call per unique key
    const uniqueIndices = [...firstIndexByKey.values()];
    const uniqueResults = await Promise.all(
      uniqueIndices.map(async (idx) => {
        const toolCall = toolCalls[idx];
        this.logger.debug(`Calling tool: ${toolCall.name}(${JSON.stringify(toolCall.arguments)})`);
        return {
          idx,
          result: await this._executeTool(projectId, toolCall.name, toolCall.arguments, conversationId),
        };
      }),
    );

    const resultByIndex = new Map<number, unknown>();
    uniqueResults.forEach(({ idx, result }) => resultByIndex.set(idx, result));

    // build bundles in original order so they line up with the LLM's tool_calls; duplicates get a stub pointing at the canonical call_id
    return toolCalls.map((toolCall, idx): AgentExecutedToolCallBundle => {
      const key = dedupKeyByIndex[idx];
      const firstIdx = firstIndexByKey.get(key)!;
      const isDuplicate = firstIdx !== idx;

      if (isDuplicate) {
        const canonicalCallId = toolCalls[firstIdx].id;
        this.logger.debug(`Deduplicated tool call ${toolCall.id} (same args as ${canonicalCallId}); returning stub`);

        return {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          toolArgs: toolCall.arguments,
          result: {
            _duplicateOf: canonicalCallId,
            _hint: `this call had identical args to ${canonicalCallId}; reuse that result instead of issuing duplicates`,
          },
        };
      }

      return {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        toolArgs: toolCall.arguments,
        result: resultByIndex.get(idx),
      };
    });
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
        return this.tools.listFiles(projectId, { pathPattern: args.pathPattern as string | undefined });

      case "read_file":
        return this.tools.readFile(projectId, args.filePath as string);

      case "read_file_range":
        return this.tools.readFileRange(
          projectId,
          args.filePath as string,
          // coerce in case the model returns these as strings despite the schema declaring number
          Number(args.startLine),
          Number(args.endLine),
        );

      case "search_symbols":
        return this.tools.searchSymbols(projectId, {
          name: args.name as string,
          type: args.type as SymbolType | undefined,
          pathPattern: args.pathPattern as string | undefined,
        });

      case "search_code":
        return this.tools.searchCode(projectId, {
          pattern: args.pattern as string,
          language: args.language as CodeFileLanguage,
          pathPattern: args.pathPattern as string | undefined,
        });

      case "get_file_tree":
        return this.tools.getFileTree(projectId);

      case "get_directory":
        return this.tools.getDirectory(projectId, args.path as string);

      case "search_files": {
        // coerce documentTypes to string[] — some models still send a single string despite the array schema; wrap defensively so .join() etc. don't blow up
        const rawDocumentTypes = args.documentTypes;
        const documentTypes = Array.isArray(rawDocumentTypes)
          ? (rawDocumentTypes as string[])
          : typeof rawDocumentTypes === "string" && rawDocumentTypes.length > 0
            ? [rawDocumentTypes]
            : undefined;

        return this.tools.searchFiles(
          projectId,
          args.query as string,
          documentTypes,
          // coerce in case the model returns topK as a string despite the schema declaring number — `as` is a type assertion only, not a runtime cast
          args.topK !== undefined ? Number(args.topK) : undefined,
        );
      }

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
          // coerce in case the model returns topK as a string despite the schema declaring number
          args.topK !== undefined ? Number(args.topK) : undefined,
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
        description:
          "List files in the project, optionally filtered by a case-insensitive substring match on the full path. Use to locate files when the resource name is in the question (e.g. pathPattern='order' to find every order-related file). Fast path before reaching for search_files.",
        parameters: {
          pathPattern: {
            type: "string",
            description:
              "Optional case-insensitive substring matched against the full file path (e.g. 'order.service', 'modules/auth', '.spec.ts'). `*` wildcards are accepted but treated as substring matches.",
          },
        },
      },
      {
        name: "read_file",
        description:
          "Read a file's content. Returns the whole file when it fits within 1500 lines; otherwise returns the first 1500 lines with a truncation marker — call read_file_range for specific spans. Prefer read_file_range when you only need a known section of a large file.",
        parameters: {
          filePath: {
            type: "string",
            description: "The path of the file to read",
          },
        },
        required: ["filePath"],
      },
      {
        name: "read_file_range",
        description:
          "Read a specific line range of a file. Token-efficient — use when you only need one function or section of a large file (e.g. when search_symbols told you which file but a small portion is enough). Range size is capped at 1500 lines per call.",
        parameters: {
          filePath: {
            type: "string",
            description: "The path of the file to read",
          },
          startLine: {
            type: "number",
            description: "First line to include (1-indexed)",
          },
          endLine: {
            type: "number",
            description: "Last line to include (1-indexed, inclusive)",
          },
        },
        required: ["filePath", "startLine", "endLine"],
      },
      {
        name: "search_symbols",
        description:
          "Search for symbols (functions, classes, types, etc.) by name. Case-insensitive partial match. Returns symbol name, type, file path, and context. Scope with pathPattern (e.g. pathPattern='order.service') when the same symbol name exists in many files.",
        parameters: {
          name: {
            type: "string",
            description: "Symbol name to search for",
          },
          type: {
            type: "string",
            description: "Optional symbol type filter (function, class, interface, type, enum, etc.)",
          },
          pathPattern: {
            type: "string",
            description:
              "Optional case-insensitive substring matched against the full file path to limit the search scope (e.g. 'order.service', 'modules/auth').",
          },
        },
        required: ["name"],
      },
      {
        name: "search_code",
        description:
          "Regex grep over file content. Returns matching files with line numbers and excerpts. Scope with pathPattern (e.g. pathPattern='modules/order') to grep only inside a subtree — much faster and cheaper than grepping the whole repo.",
        parameters: {
          pattern: {
            type: "string",
            description: "Regex pattern to search for in file content",
          },
          language: {
            type: "string",
            description: "Optional language filter (typescript, javascript, markdown, etc.)",
          },
          pathPattern: {
            type: "string",
            description:
              "Optional case-insensitive substring matched against the full file path to limit the grep scope (e.g. 'modules/order', 'src/auth').",
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
            type: "array",
            items: { type: "string" },
            description:
              "Optional array of document types to filter by. Allowed values: technicalSpecification, userStories, meetingNotes, custom, backendCodebase, webCodebase, appCodebase. Pass an array even if filtering on a single type.",
          },
          topK: {
            type: "number",
            description: "Number of results to return (default: 3). Raise to 5-8 only when the first batch is clearly insufficient.",
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
            type: "number",
            description: "Number of past messages to retrieve (default: 3)",
          },
        },
        required: ["query"],
      });
    }

    return baseTools;
  }
}
