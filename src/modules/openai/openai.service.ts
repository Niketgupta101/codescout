import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { GenerateEmbeddingOptions } from "./types/generate-embedding-options.type";
import { GenerateSummaryOptions } from "./types/generate-file-summary-options.type";
import { GenerateDocumentClassificationOptions } from "./types/generate-document-classification-options.type";
import { GenerateDocumentExtractionOptions } from "./types/generate-document-extraction-options.type";
import { OpenAiDocumentExtraction } from "./types/openai-document-extraction.type";
import { GenerateStatementSupersessionJudgmentOptions } from "./types/generate-statement-supersession-judgment-options.type";
import { GenerateTopicGroupingOptions } from "./types/generate-topic-grouping-options.type";
import { OpenAiTopicGroup } from "./types/openai-topic-group.type";
import { GenerateStatementFilterOptions } from "./types/generate-statement-filter-options.type";
import { GenerateStatementGroupingOptions } from "./types/generate-statement-grouping-options.type";
import { OpenAiStatementGroup } from "./types/openai-statement-group.type";
import { chunkTextByTokens } from "./utils/chunk-text.util";
import { stripNullBytes } from "./utils/strip-null-bytes.util";
import { OpenAiGenerateDirectorySummaryOptions } from "./types/openai-generate-directory-summary-options.type";
import { OpenAiGenerateProjectSummaryOptions } from "./types/openai-generate-project-summary-options.type";
import { OpenAiTokenUsage } from "./types/openai-token-usage.type";
import type { OpenAIChatCompletionOptions } from "./types/openai-chat-completion-options.type";
import type { LLMMessage } from "../llm/types/llm-message.type";
import type { LLMTool } from "../llm/types/llm-tool.type";
import type { LLMChatResponse } from "../llm/types/llm-chat-response.type";

// exported so IndexingCostService can tokenize the exact prompt used at indexing time
export const SUMMARY_SYSTEM_PROMPT =
  "You are a helpful assistant that generates concise file summaries with embedded tables of contents. " +
  "Write the summary in English; if the document is in another language, translate.";

const DOCUMENT_CLASSIFICATION_SYSTEM_PROMPT =
  "You characterize a project document. Classify it into exactly one genre from the provided list " +
  "(pick the single best fit; choose 'other' only when none clearly apply), and infer its event date - " +
  "when the events it describes occurred, or when it was authored - as an ISO date (YYYY-MM-DD). Use the filename " +
  "and content, but prefer explicit dates stated in the content over the filename, and use dates the text mentions " +
  "(e.g. a deadline or scheduled event) to disambiguate. When a numeric date is ambiguous (e.g. 03/07/2026 or " +
  "03072026), read it day-first (DD/MM/YYYY) unless the content clearly indicates otherwise. Use null for the date " +
  "only when it genuinely cannot be determined. Respond with the genre, a one-sentence rationale, a confidence " +
  "between 0 and 1, and the date.";

// genre is clear from the opening and structure; cap input to keep classification cheap
const DOCUMENT_CLASSIFICATION_MAX_CHARS = 16000;

const DOCUMENT_STATEMENTS_SYSTEM_PROMPT = `You extract structured project knowledge from a document as topics and statements.

Work through these steps:
1. Identify the distinct SUBJECTS the document concerns - the systems, components, features, or decisions it is about. A subject is a thing the project is about, not a document section, activity, or step: "user authentication" is a subject; "Deployment Steps", "Testing", and "Troubleshooting" are activities - attribute their content to the underlying subject. Prefer few subjects, and use one consistent name for each.
2. For each subject, extract its statements - one claim per distinct point. State each claim as a fact about the subject itself (an actual configuration, state, value, event, decision, or outcome), never as meta-description of the document (never "the document includes X", "the logs contain Y", "the file lists Z"). Capture the reason, cause, or driver behind a decision or change when the document states it - not just the bare outcome (e.g. that prices changed AND why). Also capture the proposals, intentions, and directions the participants express, not only settled facts; a stated plan or strategy is knowledge worth keeping.
3. Classify each statement. type: fact (an established state or configuration), proposal (a suggested option not yet chosen), decision (a committed choice), or question (an unresolved point). decisionStatus (open, accepted, rejected, deferred) applies to proposals and decisions and is null for facts. implementationStatus (notStarted, inProgress, blocked, done) applies to things to be built or done and is null otherwise.

Output rules:
- textRaw: a verbatim span from the document. textDerived: the bare normalized claim, with no type-label prefix.
- Write every field in English; if the document is in another language, translate. textRaw is the one exception - keep it as a verbatim span in the document's original language.
- Every topicName and optionTopicName must match a name in the topics list.
- Infer each statement's event date as an ISO date (YYYY-MM-DD) from context; use null when it has none.
- Only assert what the document supports - do not invent.`;

const DOCUMENT_REFERENCES_SYSTEM_PROMPT =
  "You extract action items and references from a project document. Action items capture who owns what: owner, " +
  "description, expectedBy, status (from the allowed set), blockedOn, and reason. References are pointers to other " +
  "documents, files, or prior work the document relies on: capture the referent text, what is expected from it, and a " +
  "verbatim span. Write every field in English; if the document is in another language, translate. textRaw is the one " +
  "exception - keep it as a verbatim span in the document's original language. Only assert what the document supports - " +
  "do not invent.";

const STATEMENT_FILTER_SYSTEM_PROMPT =
  "You curate extracted statements for a project knowledge base, keeping the fewest statements that preserve the " +
  "document's distinct knowledge. Keep substantive facts, decisions, proposals, and outcomes about the project's " +
  "subjects, including the reasons or drivers behind them. Drop: off-topic chatter (greetings, weather, small talk, " +
  "personal health, ephemeral scheduling) and anything unrelated to the project's subjects; trivial per-instance " +
  "mechanics with no standalone value (individual packets, message ids, line-level log detail); and pure " +
  "meta-commentary about the document. Collapse ONLY true per-instance repeats: when several statements assert the " +
  "same fact differing solely by an identifier or instance - e.g. 'child SA created with SPI X', 'SPI Y', 'SPI Z', or " +
  "the same proposal stated as received / selected / negotiated - keep one representative and drop the rest. Never " +
  "merge or drop distinct substantive points: different decisions, reasons, requirements, ideas, or drivers are all " +
  "kept, even when they concern the same subject. For each numbered statement return its index, keep (true to retain, " +
  "false to drop), and a brief reason.";

const STATEMENT_GROUPING_SYSTEM_PROMPT =
  "You organize a document's statements into a small set of broad subjects (topics). Group statements that concern the " +
  "same subject - a system, component, feature, or decision - under one topic. A log or status dump is usually about a " +
  "single subject; consolidate aggressively and prefer few topics. For each group output a clean, broad name, its type " +
  "from the allowed set, and the indices of the statements it contains. Place every statement index in exactly one group.";

// long documents are split into chunks of this many input tokens, extracted independently, then merged;
// sized to leave room for the system prompt and completion within the gpt-4o-mini context window
const DOCUMENT_EXTRACTION_CHUNK_TOKENS = 24000;

// completion cap for the gpt-5-mini pipeline calls (extract/filter/group); a reasoning model bills its reasoning against
// this budget, so it is set generously to avoid truncation. it is only a ceiling - billing is for tokens actually used.
const DOCUMENT_PIPELINE_MAX_COMPLETION_TOKENS = 64000;

const STATEMENT_SUPERSESSION_SYSTEM_PROMPT =
  "You decide whether a newer project statement supersedes an earlier one - that is, it replaces, overrides, " +
  "or reverses the earlier decision or fact on the same subject. Judge supersession only, not mere relatedness. " +
  "Respond with a boolean and a confidence between 0 and 1.";

const TOPIC_GROUPING_SYSTEM_PROMPT =
  "You organize a project's doc-topics into a very small set of broad, initiative-level canonical topics. You are given " +
  "the project's existing canonical topics (id, name, summary) and new doc-topic names, each with a few statements. " +
  "Place every input name in exactly one group: if it belongs to an existing canonical topic, fold it in by setting " +
  "matchTopicId to that topic's id; otherwise group it with related new names into a new topic (matchTopicId null) with " +
  "a clean, broad name, its type from the allowed set, and a one- or two-sentence summary. Consolidate aggressively: " +
  "fold related technical subjects, configurations, tests, diagnostics, and statuses into the one initiative they " +
  "serve, and absorb isolated details into the broader theme rather than giving them their own topic. Prefer folding " +
  "into an existing topic over creating a near-duplicate, and only open a new topic for a genuinely independent " +
  "workstream. Output one entry per resulting group with the exact input names it contains.";

@Injectable()
export class OpenAIService {
  readonly logger = new Logger(OpenAIService.name);
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

  _convertToOpenAIMessages(messages: LLMMessage[], systemPrompt?: string): OpenAI.Chat.ChatCompletionMessageParam[] {
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
      finishReason:
        choice?.finish_reason === "tool_calls"
          ? "tool_calls"
          : // openai returns "length" when max_tokens is hit; surface it so the agent service can warn about truncation
            choice?.finish_reason === "length"
            ? "length"
            : "stop",
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
        // openai exposes cached prefix tokens here; populated automatically when the prompt prefix matched a recent request (>=1024 tokens, ~5min ttl)
        cachedPromptTokens: response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
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

  async generateDocumentClassification({
    content,
    name,
    types,
    model = "gpt-4o-mini",
  }: GenerateDocumentClassificationOptions): Promise<{
    type: string;
    rationale: string;
    confidence: number;
    occurredAt: string | null;
    usage: OpenAiTokenUsage;
  }> {
    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: DOCUMENT_CLASSIFICATION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Document name: ${name}\n\nContent:\n${content.slice(0, DOCUMENT_CLASSIFICATION_MAX_CHARS)}`,
        },
      ],
      temperature: 0,
      max_tokens: 500,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "document_classification",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              type: { type: "string", enum: types },
              rationale: { type: "string" },
              confidence: { type: "number" },
              occurredAt: { type: ["string", "null"] },
            },
            required: ["type", "rationale", "confidence", "occurredAt"],
          },
        },
      },
    });

    const raw = response.choices[0]?.message?.content;

    if (!raw) {
      throw new Error("No classification generated from OpenAI");
    }

    const parsed = stripNullBytes(
      JSON.parse(raw) as {
        type: string;
        rationale: string;
        confidence: number;
        occurredAt: string | null;
      },
    );

    return {
      type: parsed.type,
      rationale: parsed.rationale,
      confidence: parsed.confidence,
      occurredAt: parsed.occurredAt,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  async generateStatementSupersessionJudgment({
    newStatement,
    priorStatement,
    hint,
    model = "gpt-4o-mini",
  }: GenerateStatementSupersessionJudgmentOptions): Promise<{
    supersedes: boolean;
    confidence: number;
    usage: OpenAiTokenUsage;
  }> {
    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: STATEMENT_SUPERSESSION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `New statement:\n${newStatement}\n\nPrior statement:\n${priorStatement}\n\nThe new statement indicated it changes: ${hint}\n\nDoes the new statement supersede the prior statement?`,
        },
      ],
      temperature: 0,
      max_tokens: 200,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "supersession_judgment",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              supersedes: { type: "boolean" },
              confidence: { type: "number" },
            },
            required: ["supersedes", "confidence"],
          },
        },
      },
    });

    const raw = response.choices[0]?.message?.content;

    if (!raw) {
      throw new Error("No supersession judgment generated from OpenAI");
    }

    const parsed = JSON.parse(raw) as { supersedes: boolean; confidence: number };

    return {
      supersedes: parsed.supersedes,
      confidence: parsed.confidence,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  /**
   * Judges which extracted statements are worth keeping in the knowledge base, dropping rubbish and per-instance noise.
   * Returns a keep/drop decision with a reason per input statement (indexed to the input order).
   */
  async generateStatementFilter({
    statements,
    name,
    documentType,
    model = "gpt-5-mini",
  }: GenerateStatementFilterOptions): Promise<{
    decisions: { index: number; keep: boolean; reason: string }[];
    usage: OpenAiTokenUsage;
  }> {
    const numbered = statements.map((statement, index) => `${index}. ${statement}`).join("\n");

    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: STATEMENT_FILTER_SYSTEM_PROMPT },
        { role: "user", content: `Document type: ${documentType}\nDocument name: ${name}\n\nStatements:\n${numbered}` },
      ],
      max_completion_tokens: DOCUMENT_PIPELINE_MAX_COMPLETION_TOKENS,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "statement_filter",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              decisions: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    index: { type: "integer" },
                    keep: { type: "boolean" },
                    reason: { type: "string" },
                  },
                  required: ["index", "keep", "reason"],
                },
              },
            },
            required: ["decisions"],
          },
        },
      },
    });

    const raw = response.choices[0]?.message?.content;

    if (!raw) {
      throw new Error("No statement filter generated from OpenAI");
    }

    const parsed = JSON.parse(raw) as { decisions: { index: number; keep: boolean; reason: string }[] };

    return {
      decisions: parsed.decisions,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  /**
   * Groups a document's statements into a small set of doc-topics (docStatement -> docTopic).
   * Each group carries a name, type, and the indices of the input statements it contains.
   */
  async generateStatementGrouping({
    statements,
    types,
    model = "gpt-5-mini",
  }: GenerateStatementGroupingOptions): Promise<{ groups: OpenAiStatementGroup[]; usage: OpenAiTokenUsage }> {
    const numbered = statements.map((statement, index) => `${index}. ${statement}`).join("\n");

    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: STATEMENT_GROUPING_SYSTEM_PROMPT },
        { role: "user", content: `Statements:\n${numbered}` },
      ],
      max_completion_tokens: DOCUMENT_PIPELINE_MAX_COMPLETION_TOKENS,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "statement_grouping",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              groups: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    name: { type: "string" },
                    type: { type: ["string", "null"], enum: [...types, null] },
                    memberIndices: { type: "array", items: { type: "integer" } },
                  },
                  required: ["name", "type", "memberIndices"],
                },
              },
            },
            required: ["groups"],
          },
        },
      },
    });

    const raw = response.choices[0]?.message?.content;

    if (!raw) {
      throw new Error("No statement grouping generated from OpenAI");
    }

    const parsed = JSON.parse(raw) as { groups: OpenAiStatementGroup[] };

    return {
      groups: parsed.groups,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  async generateTopicGrouping({
    existingTopics,
    topics,
    types,
    model = "gpt-4o-mini",
  }: GenerateTopicGroupingOptions): Promise<{ groups: OpenAiTopicGroup[]; usage: OpenAiTokenUsage }> {
    const existingTopicsBlock = existingTopics.length
      ? existingTopics
          .map(
            (topic) =>
              `- id: ${topic.id}\n  name: ${topic.name}${topic.summary ? `\n  summary: ${topic.summary}` : ""}`,
          )
          .join("\n")
      : "(none yet)";

    const topicsBlock = topics
      .map(
        (topic) =>
          `- ${topic.name}${topic.statements.length ? `\n${topic.statements.map((statement) => `    ${statement}`).join("\n")}` : ""}`,
      )
      .join("\n");

    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: TOPIC_GROUPING_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Existing canonical topics:\n${existingTopicsBlock}\n\nDoc-topics to place:\n${topicsBlock}`,
        },
      ],
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "topic_grouping",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              groups: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    matchTopicId: { type: ["string", "null"] },
                    name: { type: "string" },
                    type: { type: ["string", "null"], enum: [...types, null] },
                    summary: { type: "string" },
                    memberNames: { type: "array", items: { type: "string" } },
                  },
                  required: ["matchTopicId", "name", "type", "summary", "memberNames"],
                },
              },
            },
            required: ["groups"],
          },
        },
      },
    });

    const raw = response.choices[0]?.message?.content;

    if (!raw) {
      throw new Error("No topic grouping generated from OpenAI");
    }

    const parsed = JSON.parse(raw) as { groups: OpenAiTopicGroup[] };

    return {
      groups: parsed.groups,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  async generateDocumentExtraction({
    content,
    name,
    documentType,
    enums,
    model = "gpt-5-mini",
  }: GenerateDocumentExtractionOptions): Promise<{ extraction: OpenAiDocumentExtraction; usage: OpenAiTokenUsage }> {
    const chunks = chunkTextByTokens({ text: content, maxTokens: DOCUMENT_EXTRACTION_CHUNK_TOKENS });

    // extract each chunk independently, then merge - nothing is dropped for long documents
    const chunkResults = await Promise.all(
      chunks.map((chunk) => this._extractDocumentChunk({ content: chunk, name, documentType, enums, model })),
    );

    const extraction: OpenAiDocumentExtraction = { topics: [], statements: [], actionItems: [], references: [] };
    const usage: OpenAiTokenUsage = { inputTokens: 0, outputTokens: 0 };
    const seenTopicNames = new Set<string>();

    for (const chunkResult of chunkResults) {
      for (const topic of chunkResult.extraction.topics) {
        if (!seenTopicNames.has(topic.name)) {
          seenTopicNames.add(topic.name);
          extraction.topics.push(topic);
        }
      }

      extraction.statements.push(...chunkResult.extraction.statements);
      extraction.actionItems.push(...chunkResult.extraction.actionItems);
      extraction.references.push(...chunkResult.extraction.references);
      usage.inputTokens += chunkResult.usage.inputTokens;
      usage.outputTokens += chunkResult.usage.outputTokens;
    }

    // sanitize model output at the persistence boundary: postgres text columns reject null bytes
    return { extraction: stripNullBytes(extraction), usage };
  }

  async _extractDocumentChunk({
    content,
    name,
    documentType,
    enums,
    model = "gpt-5-mini",
  }: GenerateDocumentExtractionOptions): Promise<{ extraction: OpenAiDocumentExtraction; usage: OpenAiTokenUsage }> {
    // statements/topics and action items/references are extracted as separate concerns from the same source
    const [statementsResult, referencesResult] = await Promise.all([
      this._extractStatementsAndTopics({ content, name, documentType, enums, model }),
      this._extractActionsAndReferences({ content, name, documentType, enums, model }),
    ]);

    return {
      extraction: {
        topics: statementsResult.topics,
        statements: statementsResult.statements,
        actionItems: referencesResult.actionItems,
        references: referencesResult.references,
      },
      usage: {
        inputTokens: statementsResult.usage.inputTokens + referencesResult.usage.inputTokens,
        outputTokens: statementsResult.usage.outputTokens + referencesResult.usage.outputTokens,
      },
    };
  }

  async _extractStatementsAndTopics({
    content,
    name,
    documentType,
    enums,
    model = "gpt-5-mini",
  }: GenerateDocumentExtractionOptions): Promise<{
    topics: OpenAiDocumentExtraction["topics"];
    statements: OpenAiDocumentExtraction["statements"];
    usage: OpenAiTokenUsage;
  }> {
    const nullableString = { type: ["string", "null"] };

    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: DOCUMENT_STATEMENTS_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Document type: ${documentType}\nDocument name: ${name}\n\nContent:\n${content}`,
        },
      ],
      // gpt-5-mini is a reasoning model: it rejects a custom temperature and bills reasoning against the completion budget
      max_completion_tokens: DOCUMENT_PIPELINE_MAX_COMPLETION_TOKENS,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "document_statements",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              topics: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: { name: { type: "string" } },
                  required: ["name"],
                },
              },
              statements: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    topicName: { type: "string" },
                    textRaw: { type: "string" },
                    textDerived: { type: "string" },
                    type: { type: "string", enum: enums.statementType },
                    decisionStatus: { type: ["string", "null"], enum: [...enums.decisionStatus, null] },
                    implementationStatus: { type: ["string", "null"], enum: [...enums.implementationStatus, null] },
                    optionTopicName: nullableString,
                    reason: nullableString,
                    replacesPriorStatementText: nullableString,
                    actor: nullableString,
                    occurredAt: nullableString,
                  },
                  required: [
                    "topicName",
                    "textRaw",
                    "textDerived",
                    "type",
                    "decisionStatus",
                    "implementationStatus",
                    "optionTopicName",
                    "reason",
                    "replacesPriorStatementText",
                    "actor",
                    "occurredAt",
                  ],
                },
              },
            },
            required: ["topics", "statements"],
          },
        },
      },
    });

    const raw = response.choices[0]?.message?.content;

    // empty content means the model truncated (reasoning consumed the completion budget); degrade to empty rather than
    // throwing, which would fail the whole document's extraction via Promise.all and lose its statements too
    if (!raw) {
      this.logger.warn(`No statements returned for ${name} (likely truncated); continuing with none`);
      return { topics: [], statements: [], usage: { inputTokens: 0, outputTokens: 0 } };
    }

    const parsed = JSON.parse(raw) as Pick<OpenAiDocumentExtraction, "topics" | "statements">;

    return {
      topics: parsed.topics,
      statements: parsed.statements,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  async _extractActionsAndReferences({
    content,
    name,
    documentType,
    enums,
    model = "gpt-5-mini",
  }: GenerateDocumentExtractionOptions): Promise<{
    actionItems: OpenAiDocumentExtraction["actionItems"];
    references: OpenAiDocumentExtraction["references"];
    usage: OpenAiTokenUsage;
  }> {
    const nullableString = { type: ["string", "null"] };

    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: DOCUMENT_REFERENCES_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Document type: ${documentType}\nDocument name: ${name}\n\nContent:\n${content}`,
        },
      ],
      max_completion_tokens: DOCUMENT_PIPELINE_MAX_COMPLETION_TOKENS,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "document_actions_references",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              actionItems: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    topicName: nullableString,
                    owner: { type: "string" },
                    description: { type: "string" },
                    expectedBy: nullableString,
                    status: { type: "string", enum: enums.actionItemStatus },
                    blockedOn: nullableString,
                    reason: nullableString,
                    textRaw: { type: "string" },
                  },
                  required: [
                    "topicName",
                    "owner",
                    "description",
                    "expectedBy",
                    "status",
                    "blockedOn",
                    "reason",
                    "textRaw",
                  ],
                },
              },
              references: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    topicName: nullableString,
                    referentText: { type: "string" },
                    expectation: { type: "string" },
                    textRaw: { type: "string" },
                  },
                  required: ["topicName", "referentText", "expectation", "textRaw"],
                },
              },
            },
            required: ["actionItems", "references"],
          },
        },
      },
    });

    const raw = response.choices[0]?.message?.content;

    // empty content means the model truncated; degrade to empty so the document still keeps its statements
    if (!raw) {
      this.logger.warn(`No actions or references returned for ${name} (likely truncated); continuing with none`);
      return { actionItems: [], references: [], usage: { inputTokens: 0, outputTokens: 0 } };
    }

    const parsed = JSON.parse(raw) as Pick<OpenAiDocumentExtraction, "actionItems" | "references">;

    return {
      actionItems: parsed.actionItems,
      references: parsed.references,
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
    // gpt-4o-mini handles 128K tokens of context - full file content is sent without truncation
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
