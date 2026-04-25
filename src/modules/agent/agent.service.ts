import { Injectable, Logger } from "@nestjs/common";
import { AgentToolsService } from "./agent-tools.service";
import type { ConversationsService } from "../conversations/conversations.service";
import { CodeFileLanguage, SymbolType } from "@prisma/client";
import { LLMService } from "../llm/llm.service";
import type { LLMProvider } from "../llm/types/llm-provider.type";
import type { LLMMessage } from "../llm/types/llm-message.type";
import type { LLMTool } from "../llm/types/llm-tool.type";
import { AgentQuery } from "./types/agent-query.type";
import { AgentResponse } from "./types/agent-response.type";
import { AgentLLMAnswerToQuery } from "./types/agent-llm-answer-to-query.type";

@Injectable()
export class AgentService {
  readonly logger = new Logger(AgentService.name);
  conversationsService: ConversationsService | undefined;

  constructor(
    readonly tools: AgentToolsService,
    readonly llmService: LLMService,
  ) {}

  /**
   * Set conversations service (circular dependency workaround)
   */
  setConversationsService(service: ConversationsService): void {
    this.conversationsService = service;
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
    const timeoutMs = request.timeoutMs ?? 30000;

    this.logger.log(`Agent query: "${request.query}" (${provider}/${model})`);

    const toolCalls: AgentResponse["toolCalls"] = [];
    const messages: LLMMessage[] = [
      {
        role: "system",
        content: `You are a helpful coding assistant that helps users understand codebases and documents. You have access to tools to explore the project.

Project ID: ${projectId}

Available tools:
- search_files: Semantic search for relevant files (BEST for discovering what to read)
- list_files: List all files (optional pattern filter)
- read_file: Read full content of a file
- search_symbols: Find functions, classes, types by name
- search_code: Search for code patterns using regex
- get_file_tree: Get project folder structure
- get_stats: Get project statistics
- get_directory: List files in a directory

**YOUR JOB: Gather accurate information from the codebase**

You are a research assistant. Your job is to:
1. Find relevant files using search tools
2. Read the actual file content
3. Extract key information and relevant code excerpts
4. Provide factual findings based on what you read

**EXPLORATION STRATEGY:**

For feature/implementation questions ("explain X", "how does Y work"):
1. FIRST: Use search_files to discover relevant files
   - Use expanded natural language queries with synonyms (e.g., "user registration signup create account" not just "register")
   - Search with documentTypes=['technicalSpecification', 'userStories', 'meetingNotes', 'custom'] for documentation
   - Then search with documentTypes=['backendCodebase', 'webCodebase', 'appCodebase', 'custom'] for code
   - **CRITICAL: If search returns 0 results, try 2-3 alternative queries with different synonyms before giving up**
     Example: "register" → "user signup" → "user creation" → "account creation"
2. SECOND: **ALWAYS read actual file content** - summaries are ONLY for discovery
   - Look at the file paths and summaries from search results
   - Choose which files to read based on relevance (file names, similarity scores)
   - **IMPORTANT: Follow the logic chain to find actual implementation**
     - If a file just calls methods from other files, read those files too
     - Example: if you read a file that calls authService.login(), also read the file containing that method
     - Your goal: show the actual business logic that answers the user's question
     - You CAN read files not in search results if they contain the actual implementation
   - **Don't read unrelated/random files** - only follow the logic chain to complete the answer
   - **NEVER answer from summaries alone - read the actual files**
3. THIRD: Answer based ONLY on files you actually read
   - If you cannot find relevant files after trying multiple search queries, respond: "I cannot find [feature] in this codebase"
   - **NEVER make assumptions or generate code that doesn't exist**
   - Cite specific file paths and line numbers in your answer

For "what is this project about" questions:
- Use search_files without documentTypes filter to find all relevant files
- **ALWAYS read the actual files** - do not rely on summaries alone
- Prioritize reading documentation (PDFs, READMEs, spec docs, CSVs)
- Provide high-level overview from actual content you read

**CRITICAL GROUNDING RULES:**
- ONLY provide information from files you actually read with read_file tool
- If information is not in the files you read, say "I don't have information about [X]"
- NEVER infer, assume, or generate code/details that aren't explicitly in the file content
- Always cite specific file paths when providing information
- Provide relevant code excerpts when you find them

The user wants accurate information from their codebase, not generic knowledge.`,
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

        // execute each tool call
        for (const toolCall of response.toolCalls) {
          const toolName = toolCall.name;
          const toolArgs = toolCall.arguments;

          this.logger.debug(`Calling tool: ${toolName}(${JSON.stringify(toolArgs)})`);

          // execute tool
          const result = await this._executeTool(projectId, toolName, toolArgs, undefined);

          // record tool call
          toolCalls.push({
            id: toolCall.id,
            tool: toolName,
            args: toolArgs,
            result,
          });

          // add tool result to messages
          messages.push({
            role: "tool",
            toolResult: {
              toolCallId: toolCall.id,
              content: JSON.stringify(result),
            },
          });
        }

        // continue loop (LLM will process tool results)
        continue;
      }

      // no tool calls - agent has gathered information, now generate final answer
      if (response.content) {
        const durationMs = Date.now() - startTime;

        this.logger.log(
          `Agent research complete: ${iterations} iterations, ${toolCalls.length} tool calls, ${durationMs}ms`,
        );
        this.logger.log(`Generating final answer from research findings...`);

        // Generate concise answer from agent's research
        const finalAnswer = await this._generateAnswer(request.query, response.content, provider, model);

        return {
          answer: finalAnswer,
          toolCalls,
          iterations,
          durationMs,
        };
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
    const timeoutMs = request.timeoutMs ?? 30000;

    this.logger.log(
      `Agent query with context (${conversationContext.length} messages): "${request.query}" (${provider}/${model})`,
    );

    const toolCalls: AgentResponse["toolCalls"] = [];
    const messages: LLMMessage[] = [
      {
        role: "system",
        content: this._buildSystemPrompt(projectId, !!conversationId),
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

        // execute each tool call
        for (const toolCall of response.toolCalls) {
          const toolName = toolCall.name;
          const toolArgs = toolCall.arguments;

          this.logger.debug(`Calling tool: ${toolName}(${JSON.stringify(toolArgs)})`);

          // execute tool
          const result = await this._executeTool(projectId, toolName, toolArgs, conversationId);

          // record tool call
          toolCalls.push({
            id: toolCall.id,
            tool: toolName,
            args: toolArgs,
            result,
          });

          // add tool result to messages
          messages.push({
            role: "tool",
            toolResult: {
              toolCallId: toolCall.id,
              content: JSON.stringify(result),
            },
          });
        }

        // continue loop (LLM will process tool results)
        continue;
      }

      // no tool calls - agent has gathered information, now generate final answer
      if (response.content) {
        const durationMs = Date.now() - startTime;

        this.logger.log(
          `Agent research complete: ${iterations} iterations, ${toolCalls.length} tool calls, ${durationMs}ms`,
        );
        this.logger.log(`Generating final answer from research findings...`);

        // Generate concise answer from agent's research
        const finalAnswer = await this._generateAnswer(request.query, response.content, provider, model);

        return {
          answer: finalAnswer,
          toolCalls,
          iterations,
          durationMs,
        };
      }

      // edge case: no content and no tool calls
      throw new Error("LLM returned no content or tool calls");
    }

    throw new Error(`Max iterations (${maxIterations}) reached`);
  }

  /**
   * Build system prompt
   */
  _buildSystemPrompt(projectId: string, hasConversationContext: boolean): string {
    const basePrompt = `You are a helpful coding assistant that helps users understand codebases and documents. You have access to tools to explore the project.

Project ID: ${projectId}

Available tools:
- search_files: Semantic search for relevant files (BEST for discovering what to read)
- list_files: List all files (optional pattern filter)
- read_file: Read full content of a file
- search_symbols: Find functions, classes, types by name
- search_code: Search for code patterns using regex
- get_file_tree: Get project folder structure
- get_stats: Get project statistics
- get_directory: List files in a directory`;

    const conversationTools = hasConversationContext
      ? "\n- search_conversation_history: Search previous messages in this conversation"
      : "";

    return (
      basePrompt +
      conversationTools +
      `

**EXPLORATION STRATEGY:**

For feature/implementation questions ("explain X", "how does Y work"):
1. FIRST: Use search_files to discover relevant files
   - Use expanded natural language queries with synonyms (e.g., "user registration signup create account" not just "register")
   - Search with documentTypes=['technicalSpecification', 'userStories', 'meetingNotes', 'custom'] for documentation
   - Then search with documentTypes=['backendCodebase', 'webCodebase', 'appCodebase', 'custom'] for code
   - **CRITICAL: If search returns 0 results, try 2-3 alternative queries with different synonyms before giving up**
     Example: "register" → "user signup" → "user creation" → "account creation"
2. SECOND: **ALWAYS read actual file content** - summaries are ONLY for discovery
   - Look at the file paths and summaries from search results
   - Choose which files to read based on relevance (file names, similarity scores)
   - **IMPORTANT: Follow the logic chain to find actual implementation**
     - If a file just calls methods from other files, read those files too
     - Example: if you read a file that calls authService.login(), also read the file containing that method
     - Your goal: show the actual business logic that answers the user's question
     - You CAN read files not in search results if they contain the actual implementation
   - **Don't read unrelated/random files** - only follow the logic chain to complete the answer
   - **NEVER answer from summaries alone - read the actual files**
3. THIRD: Answer based ONLY on files you actually read
   - If you cannot find relevant files after trying multiple search queries, respond: "I cannot find [feature] in this codebase"
   - **NEVER make assumptions or generate code that doesn't exist**
   - Cite specific file paths and line numbers in your answer

For "what is this project about" questions:
- Use search_files without documentTypes filter to find all relevant files
- **ALWAYS read the actual files** - do not rely on summaries alone
- Prioritize reading documentation (PDFs, READMEs, spec docs, CSVs)
- Provide high-level overview from actual content you read

**CRITICAL GROUNDING RULES:**
- ONLY provide information from files you actually read with read_file tool
- If information is not in the files you read, say "I don't have information about [X]"
- NEVER infer, assume, or generate code/details that aren't explicitly in the file content
- Always cite specific file paths when providing information
- Provide relevant code excerpts when you find them

The user wants accurate information from their codebase, not generic knowledge.`
    );
  }

  /**
   * Generate final answer from agent's research findings.
   * Uses structured outputs to enforce response format.
   */
  async _generateAnswer(
    query: string,
    agentFindings: string,
    provider: LLMProvider,
    model: string,
  ): Promise<string> {
    try {
      const response = await this.llmService.chatCompletion({
        provider,
        model,
        messages: [
          {
            role: "system",
            content: `You are an expert codebase analyst. Your goal: Provide deep understanding so users don't need to read the code.

Answer based ONLY on the provided research findings from the codebase.

Content generation guidelines:

"answer": High-level overview of what the user is asking about
- Natural, conversational tone
- Cover the main concept

"details": RICH explanations of how things actually work
- Focus on informativeness and completeness, not brevity
- Explain the FLOW: what happens step by step
- Explain the WHY: why decisions are made
- Include CONDITIONS: what happens in different scenarios
- Describe interactions between components

Example of GOOD vs BAD details:
❌ BAD: "The AuthService validates credentials"
✅ GOOD: "When login is called, AuthService queries the database for the user by email. If found, it uses bcrypt to compare the provided password with the stored hash. On successful match, it generates a JWT access token and refresh token, stores the session in the database, and returns both tokens to the client. If credentials don't match, it returns an authentication error."

Key: User should understand the actual behavior without reading code.

"codeSnippets": Well-chosen code examples with actual logic
- ONLY show code that contains actual implementation logic
- Don't show code that just calls other methods without showing what those methods do
- If controller calls service.method(), show the service method code, not the controller
- Show the actual business logic, not just routing/delegation code
- Include inline comments for clarity
- If the actual implementation isn't in the files provided, use empty array []

"showDetails": Boolean flag to control detail display
- true: For most questions ("How does X work?", "Explain X", "Tell me about X", "Dive deeper")
- false: Only for very basic definition questions ("What is X?")

"showCode": Boolean flag to control code display - IMPORTANT: Default to false
- false: For ALL questions about "how", "what", "explain", "describe" (conceptual understanding)
- true: ONLY when user explicitly asks to see code/implementation
  Examples of true: "show me the code", "what's the implementation", "how is it coded"
- When in doubt, use false - most questions want understanding, not code

Always cite file paths. If findings incomplete, state what you found and what's missing.`,
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
      return this._formatAnswer(parsedAnswer);
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

      case "get_stats":
        return this.tools.getStats(projectId);

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
        if (!conversationId || !this.conversationsService) {
          return {
            success: false,
            error: "Conversation history search not available",
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
        name: "get_stats",
        description:
          "Get project statistics including total files, files by language, total symbols, and symbols by type. Useful for understanding project scope.",
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
