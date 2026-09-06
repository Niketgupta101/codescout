import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { GenerateEmbeddingOptions } from "./types/generate-embedding-options.type";
import { GenerateSummaryOptions } from "./types/generate-file-summary-options.type";
import { GenerateDocumentClassificationOptions } from "./types/generate-document-classification-options.type";
import { GenerateDocumentExtractionOptions } from "./types/generate-document-extraction-options.type";
import { OpenAiDocumentExtraction } from "./types/openai-document-extraction.type";
import { GenerateStatementSupersessionJudgmentOptions } from "./types/generate-statement-supersession-judgment-options.type";
import { GenerateStatementSupersessionJudgmentsOptions } from "./types/generate-statement-supersession-judgments-options.type";
import { GenerateTopicGroupingOptions } from "./types/generate-topic-grouping-options.type";
import { OpenAiTopicGroup } from "./types/openai-topic-group.type";
import { GenerateActionItemGroupingOptions } from "./types/generate-action-item-grouping-options.type";
import { OpenAiActionItemGroup } from "./types/openai-action-item-group.type";
import { GenerateReferenceResolutionJudgmentOptions } from "./types/generate-reference-resolution-judgment-options.type";
import { GenerateActionItemResolutionJudgmentsOptions } from "./types/generate-action-item-resolution-judgments-options.type";
import { ActionItemResolutionDecision } from "./types/action-item-resolution-decision.type";
import { evidenceQuoteOccursIn } from "src/utils/evidence-quote.util";
import { GenerateStatementCurationOptions } from "./types/generate-statement-curation-options.type";
import { GenerateActionItemCurationOptions } from "./types/generate-action-item-curation-options.type";
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
import { EmbeddingModel } from "openai/resources/embeddings.js";
import { ProjectTopicType } from "@prisma/client";
import { ChatModel } from "openai/resources/shared.js";

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
0. Use the supplied project context as the relevance boundary. When context is sparse, infer the primary project scope from the document title, summary, and dominant operational content. In mixed documents and transcripts, exclude standalone workplace discussion that does not materially affect that project's product, operations, integrations, contract, or delivery, even when it is detailed, repeated, or technically interesting.
1. Identify the distinct SUBJECTS the document concerns - the systems, components, features, or decisions it is about. A subject is a thing the project is about, not a document section, activity, or step: "user authentication" is a subject; "Deployment Steps", "Testing", and "Troubleshooting" are activities - attribute their content to the underlying subject. Prefer few subjects, and use one consistent name for each.
2. For each subject, extract retrieval-ready knowledge units rather than one item per utterance. A unit is a durable fact, decision, seriously considered proposal, or unresolved question that a future user could search for. Merge adjacent supporting details, reasons, and outcomes when they describe the same independently changing state. Keep separate units only when they could change independently. State each unit as a fact about the subject itself (an actual configuration, state, value, event, decision, or outcome), never as meta-description of the document (never "the document includes X", "the logs contain Y", "the file lists Z").
3. Classify each statement. type: fact (an established state or configuration), proposal (a suggested option not yet chosen), decision (a committed choice), or question (an unresolved point). decisionStatus (open, accepted, rejected, deferred) applies to proposals and decisions and is null for facts. implementationStatus (notStarted, inProgress, blocked, done) applies to things to be built or done and is null otherwise.

Output rules:
- textRaw: a verbatim span from the document. textDerived: the bare normalized claim, with no type-label prefix.
- Preserve formulas, identifiers, field names, and their operands verbatim inside textDerived; translate the surrounding explanation, but do not guess a translation for an ambiguous domain term.
- textDerived must stand alone in a search result: name the actual entity, system, feature, actor, artifact, or dependency instead of relying on the topic or on words such as "it", "this", "the document", "the data", or "the points". Include the exact pending dependency instead of saying a project is merely "waiting".
- textRaw must be the complete minimal contiguous evidence span supporting every part of textDerived. Include adjacent speaker turns when they are needed to establish the actor, object, commitment, reason, or status. Never make textDerived more certain or specific than this evidence.
- Preserve temporal scope and uncertainty. Distinguish current state from a historical update, intention from accepted decision, and a target from a commitment. Do not turn "we want to", "maybe", or "we hope" into an accepted decision.
- Exclude greetings, meeting scheduling, generic progress monitoring, administrative coordination, temporary debugging narration, and other transient details unless they materially change a durable project state or decision.
- Do not elevate a passing, un-engaged aside or hypothetical the participants do not take up (e.g. a throwaway "maybe X?") into a tracked proposal; record proposals the discussion actually considers.
- Do not emit backward-looking recaps of decisions already made in earlier meetings as new statements (e.g. "the team had previously decided X"). Capture new claims, changes, and the current final state - not restatements of an earlier, possibly outdated, state.
- Preserve material facts, decisions, blockers, and testing or delivery status about every explicitly named external system, integration, vendor, API, or downstream service in the chunk. Include that exact proper name in textDerived so direct queries for the integration can retrieve it.
- Return at most 8 statements for one content chunk. When more claims are present, prioritize decisions, current requirements, blockers, changed states, and unresolved questions that are most useful in project search.
- actor: who made or is responsible for the statement. Prefer their role or title (e.g. "industrial designer", "project manager") when the document establishes roles; otherwise their name; null when the document does not attribute it. In meeting transcripts, attribute each statement to its speaker.
- Write every field in English; if the document is in another language, translate. textRaw is the one exception - keep it as a verbatim span in the document's original language.
- Every topicName and optionTopicName must match a name in the topics list.
- Infer each statement's event date as an ISO date (YYYY-MM-DD) from context; use null when it has none.
- Only assert what the document supports - do not invent.`;

const DOCUMENT_REFERENCES_SYSTEM_PROMPT =
  "You extract explicit action-item commitments and references from a project document. Use the supplied project " +
  "context as the relevance boundary and exclude commitments unrelated to that project's product, operations, " +
  "integrations, contract, or delivery. An action item requires a " +
  "specific accountable person or explicitly named responsible team, a concrete deliverable or verifiable outcome, and " +
  "source evidence that somebody accepted or was assigned the work. Requirements, ideas, decisions, general intentions, " +
  "recurring monitoring, meeting scheduling, administrative discussion, and vague requests such as 'follow up', 'apply " +
  "pressure', or 'discuss it' are not action items unless the source establishes a concrete owner and outcome. Never use " +
  "'The group' or an inferred collective as owner. Preserve jointly accountable named owners when explicit. Keep one " +
  "action per independently completable outcome; include multiple implementation steps in one action only when they serve " +
  "the same deliverable. The description must name the relevant system, artifact, recipient, and purpose when the source " +
  "supports them, and must stand alone outside the transcript. Action items capture owner, description, expectedBy, " +
  "status (from the allowed set), blockedOn, and reason. References are pointers to other " +
  "documents, files, or prior work the document relies on: capture the referent text, what is expected from it, and a " +
  "complete minimal verbatim evidence span. Write every field in English; if the document is in another language, translate. textRaw is the one " +
  "exception - keep it as a verbatim span in the document's original language. When the source is an explicit Next " +
  "Steps or Action Items section, inspect every bullet and return every bullet that names an accountable owner and a " +
  "concrete project deliverable; do not stop after the first qualifying item. Exclude social plans, meals, travel, and " +
  "other personal or administrative bullets. Preserve formulas, identifiers, field names, and operands verbatim in " +
  "descriptions rather than guessing translations for ambiguous domain terms. Return at most 12 action items and 6 " +
  "references for one content chunk, prioritizing concrete current commitments and material dependencies. Only assert what the document supports - " +
  "do not invent.";

const STATEMENT_CURATION_SYSTEM_PROMPT = `You filter extracted statements for a searchable project knowledge base.

Return exactly one decision for every supplied zero-based index, in the same order. Set keep=true only when the existing textDerived is self-contained, supported by textRaw, and useful for answering a future question about the project. Never rewrite, merge, reclassify, or repair an item; only decide whether the supplied extraction is safe and useful as written.

Keep durable project facts, decisions, seriously considered proposals, unresolved questions, reasons, and material state changes. Drop meeting logistics, administrative coordination, generic monitoring, temporary debugging narration, vague project-management remarks, unsupported extrapolations, and general anecdotes about AI, competitors, ethics, travel, people, or technology that do not materially affect this project's product, operations, contract, integration, or delivery.

Use the supplied project context as the relevance boundary. A detailed claim is still off-topic when it does not materially affect that project.

Drop a statement when textRaw does not establish the actor, entity, certainty, scope, or status asserted by textDerived. Drop context-dependent statements that rely on the topic or on unresolved words such as "it", "this", "they", "the document", "the data", or "the points". Do not keep aspirations or estimates classified as accepted decisions.`;

const ACTION_ITEM_CURATION_SYSTEM_PROMPT = `You filter extracted action items for a searchable project knowledge base.

Return exactly one decision for every supplied zero-based index, in the same order. Never rewrite, merge, split, change status, or replace the owner; only decide whether the supplied action is safe and useful as written.

Set keep=true only when textRaw itself establishes: (1) the stated accountable owner, (2) the concrete deliverable or verifiable outcome in the description, and (3) an accepted assignment or commitment rather than a requirement, idea, hope, inference, or general direction. The description must stand alone and identify the relevant system, artifact, data, recipient, and purpose when needed.

Use the supplied project context as the relevance boundary and drop unrelated commitments.

Drop owners such as "The group" or an inferred collective. Drop meeting scheduling, general monitoring, administrative summaries, requests merely to discuss or apply pressure, generic continuation of work, and requirements nobody explicitly accepted. Drop any item whose description is more specific than its textRaw evidence.`;

const STATEMENT_GROUPING_SYSTEM_PROMPT =
  "You organize a document's statements into a small set of broad subjects (topics). Group statements that concern the " +
  "same subject - a system, component, feature, or decision - under one topic. A log or status dump is usually about a " +
  "single subject; consolidate aggressively and prefer few topics. For each group output a clean, broad name, its type " +
  "from the allowed set, and the indices of the statements it contains. Place every statement index in exactly one group.";

// long documents are split into chunks of this many input tokens, extracted independently, then merged;
// sized to leave room for the system prompt and completion within the gpt-5-mini context window
const REMOTE_DOCUMENT_EXTRACTION_CHUNK_TOKENS = 24000;

// completion cap for every gpt-5-mini pipeline call (extract/filter/group, classify, summaries, resolution judgments);
// a reasoning model bills its reasoning against this budget, so it is set generously to avoid truncation. it is only a
// ceiling - billing is for tokens actually used.
const REMOTE_DOCUMENT_PIPELINE_MAX_COMPLETION_TOKENS = 64000;
const CURATION_FILTER_BATCH_SIZE = 20;
const CURATION_MAX_COMPLETION_TOKENS = 8192;
// Grouping output is compact and bounded by its input batch. A 64k ceiling lets small local models spiral into a full
// reasoning-length generation after the client has already timed out, blocking every later request behind it.
const RECONCILIATION_GROUPING_MAX_COMPLETION_TOKENS = 8192;
const ACTION_ITEM_GROUPING_MAX_COMPLETION_TOKENS = 4096;
// resolution decisions each carry a verbatim quote and a reason, so they need more room than grouping
const ACTION_ITEM_RESOLUTION_MAX_COMPLETION_TOKENS = 8192;

const STATEMENT_SUPERSESSION_SYSTEM_PROMPT =
  "You decide whether a newer project statement SUPERSEDES an earlier one - it explicitly replaces, overrides, or " +
  "reverses the earlier statement's specific decision or fact. Supersession requires BOTH that the two statements are " +
  "about the SAME specific subject or decision AND that the newer one changes the earlier outcome. It is NOT " +
  "supersession when the newer statement merely relates to the earlier one, confirms/agrees with/restates/refines it, " +
  "or is a broad strategy or general direction that does not specifically overturn the earlier choice. Different " +
  "subjects never supersede each other. Candidates are ordered nearest-first. Return the first true supersession's " +
  "candidateId and a confidence between 0 and 1, or candidateId null when none qualifies.";

const STATEMENT_BATCH_SUPERSESSION_SYSTEM_PROMPT =
  "For each numbered statement, decide whether one of its ordered candidate statements forms a true supersession - it " +
  "explicitly replaces, overrides, or reverses the statement's specific decision or fact. Supersession requires BOTH " +
  "that the two statements are about the SAME specific subject or decision AND that the newer one changes the earlier " +
  "outcome. It is NOT supersession when the newer statement merely relates to the earlier one, confirms/agrees with/" +
  "restates/refines it, or is a broad strategy or general direction that does not specifically overturn the earlier " +
  "choice. Different subjects never supersede each other. Return one decision per numbered input: select the first " +
  "candidateId that qualifies with confidence between 0 and 1, or candidateId null when none qualifies.";

const REFERENCE_RESOLUTION_SYSTEM_PROMPT =
  "You decide whether a candidate is the thing a document reference points to. You are given the reference text, the " +
  "expectation the source document holds about it, and one candidate (a document summary or a statement). Set isReferent " +
  "true only when the candidate clearly IS the referent, not merely a related item. When it is the referent, judge the " +
  "expectation: 'linked' if the candidate upholds it, 'contradicted' if it violates it. Do not guess - require a clear " +
  "match. Candidates are ordered by precedence and similarity. Return the first clear referent's candidateId, kind, " +
  "resolution, and confidence, or a null candidate when none qualifies.";

const ACTION_ITEM_BATCH_RESOLUTION_SYSTEM_PROMPT = `You examine numbered action items, each with its own evidence candidates, and report only the candidates that decisively bear on whether that item's specific deliverable is COMPLETE.

Emit a decision for a candidate only when one of these is unambiguously true:
- "supports": the candidate explicitly establishes that this exact deliverable was completed.
- "contradicts": the candidate explicitly establishes it was not completed - still open, still in progress, blocked, abandoned, or reopened after completion.

Emit nothing at all for a candidate when any of the following holds, however plausible completion seems:
- it concerns related work, the same feature, the same system, the same owner, or the same recipient, but not this deliverable;
- it shows the work planned, assigned, promised, or merely discussed;
- completion is implied by silence, by the absence of complaint, or by a general status update;
- you would have to assume, infer, or fill in a step to reach completion;
- more than one reading of the candidate is defensible.

Emitting nothing is the correct and expected outcome for most candidates. An item left unresolved is re-examined for free when new evidence arrives; a wrong "supports" silently corrupts the project's record. Report every decisive candidate you find, including ones that contradict each other - do not pick a side, and do not suppress a contradicting candidate because another one supports.

Every decision must carry:
- index: the number of the action item the candidate is listed under.
- candidateId and candidateKind: exactly as listed under THAT item. Never an id from another item, never an id you were not given.
- evidenceQuote: 12 to 300 characters copied CHARACTER-FOR-CHARACTER from that candidate's text. Do not translate it, correct spelling, expand abbreviations, or change punctuation. It is checked mechanically against the candidate text, and a quote that does not occur verbatim voids the decision.
- reason: one sentence naming the deliverable and what the quote establishes about it.
- confidence: between 0 and 1.`;

const TOPIC_GROUPING_SYSTEM_PROMPT =
  "You organize a project's doc-topics into a very small set of broad, initiative-level canonical topics. You are given " +
  "the project's existing canonical topics (id, name, summary) and new doc-topic names, each with a few statements. " +
  "Place every input name in exactly one group: if it belongs to an existing canonical topic, fold it in by setting " +
  "matchTopicId to an id listed in that input's candidate ids. Never match an input to an existing id outside its " +
  "candidate list. Otherwise group it with related new names into a new topic (matchTopicId null) with " +
  "a clean, broad name, its type from the allowed set, and a one- or two-sentence summary. Consolidate aggressively: " +
  "fold related technical subjects, configurations, tests, diagnostics, and statuses into the one initiative they " +
  "serve, and absorb isolated details into the broader theme rather than giving them their own topic. Prefer folding " +
  "into an existing topic over creating a near-duplicate, and only open a new topic for a genuinely independent " +
  "workstream. Output one entry per resulting group with the exact input names it contains.";

const ACTION_ITEM_GROUPING_SYSTEM_PROMPT =
  "You decide whether each extracted action item is the same concrete commitment as one existing canonical action item. " +
  "Output exactly one group for every numbered input, and every group's memberIndices must contain exactly that one input " +
  "index. Set matchActionItemId only when the concrete deliverable, scope, and accountable owner agree. Related work, " +
  "the same feature, the same owner, or a shared recipient is not enough. A group may match only an id in that input's " +
  "candidate ids. Otherwise set matchActionItemId to null and produce a compact imperative title, self-contained " +
  "description, and owner (null if unclear). Do not merge two new inputs with each other, invent ids, or omit an input.";

class InvalidDocumentExtractionResponseError extends Error {}
type DocumentExtractionChunkOptions = GenerateDocumentExtractionOptions & {
  extractionTarget: "statements" | "actions";
};

@Injectable()
export class OpenAIService {
  readonly logger = new Logger(OpenAIService.name);
  readonly openai: OpenAI;
  readonly embeddingOpenAI: OpenAI;
  readonly inferenceModelDefault: string;
  readonly embeddingModelDefault: string;
  readonly inferenceConcurrency: number;
  readonly inferenceReasoningOptions: { reasoning_effort?: "low" };
  readonly documentExtractionChunkTokens: number;
  readonly documentPipelineMaxCompletionTokens: number;

  constructor(readonly configService: ConfigService) {
    const optionalConfigString = (key: string): string | undefined => {
      const value = this.configService.get<string>(key);
      return value === undefined || value.trim() === "" ? undefined : value;
    };
    const baseURL = optionalConfigString("OPENAI_BASE_URL");
    const isCustomInferenceEndpoint =
      !!baseURL && baseURL.replace(/\/+$/, "") !== "https://api.openai.com/v1";
    const apiKey = this.configService.get<string>("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    this.inferenceModelDefault = this.configService.get<string>("OPENAI_DEFAULT_INFERENCE_MODEL", "gpt-5.6-luna");
    this.embeddingModelDefault = this.configService.get<string>(
      "OPENAI_DEFAULT_EMBEDDING_MODEL",
      "text-embedding-3-large",
    );
    const configuredConcurrency = this.configService.get<number>("OPENAI_INFERENCE_CONCURRENCY");
    this.inferenceConcurrency = configuredConcurrency ?? (isCustomInferenceEndpoint ? 1 : 4);
    // MTPLX/Qwen custom endpoints default to non-thinking mode when this field is omitted. Sending even "low" enables
    // thinking and can make a structured extraction run until its entire completion budget is exhausted.
    this.inferenceReasoningOptions = isCustomInferenceEndpoint ? {} : { reasoning_effort: "low" };
    const configuredTimeout = this.configService.get<number>("OPENAI_INFERENCE_TIMEOUT_MS");
    this.documentExtractionChunkTokens =
      this.configService.get<number>("OPENAI_DOCUMENT_EXTRACTION_CHUNK_TOKENS") ??
      (isCustomInferenceEndpoint ? 3000 : REMOTE_DOCUMENT_EXTRACTION_CHUNK_TOKENS);
    this.documentPipelineMaxCompletionTokens =
      this.configService.get<number>("OPENAI_PIPELINE_MAX_COMPLETION_TOKENS") ??
      REMOTE_DOCUMENT_PIPELINE_MAX_COMPLETION_TOKENS;

    this.openai = new OpenAI({
      apiKey,
      baseURL,
      // A local model can legitimately need longer than the SDK's ten-minute default. Do not retry a timed-out local
      // generation: the server may still be finishing it, and a retry only adds another expensive queued request.
      ...(isCustomInferenceEndpoint ? { timeout: configuredTimeout ?? 1_800_000, maxRetries: 0 } : {}),
      ...(!isCustomInferenceEndpoint && configuredTimeout ? { timeout: configuredTimeout } : {}),
    });
    const embeddingBaseURL = optionalConfigString("OPENAI_EMBEDDING_BASE_URL") ?? "https://api.openai.com/v1";
    this.embeddingOpenAI = new OpenAI({
      apiKey: optionalConfigString("OPENAI_EMBEDDING_API_KEY") ?? apiKey,
      baseURL: embeddingBaseURL,
    });
  }

  async generateEmbedding({
    input,
    model = this.embeddingModelDefault as EmbeddingModel,
  }: GenerateEmbeddingOptions): Promise<{ embedding: number[]; usage: OpenAiTokenUsage }> {
    const response = await this.embeddingOpenAI.embeddings.create({
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

  async generateEmbeddings(inputs: string[]): Promise<{ embeddings: number[][]; usage: OpenAiTokenUsage }> {
    if (inputs.length === 0) {
      return { embeddings: [], usage: { inputTokens: 0, outputTokens: 0 } };
    }

    const embeddings: number[][] = [];
    let inputTokens = 0;

    // Keep requests comfortably bounded and preserve input order across chunks.
    for (let offset = 0; offset < inputs.length; offset += 100) {
      const chunk = inputs.slice(offset, offset + 100);
      const response = await this.embeddingOpenAI.embeddings.create({
        input: chunk,
        model: this.embeddingModelDefault as EmbeddingModel,
      });

      if (response.data.length !== chunk.length) {
        throw new Error(
          `Embedding response count mismatch: expected ${chunk.length}, received ${response.data.length}`,
        );
      }

      embeddings.push(...response.data.sort((first, second) => first.index - second.index).map((row) => row.embedding));
      inputTokens += response.usage?.prompt_tokens ?? 0;
    }

    return { embeddings, usage: { inputTokens, outputTokens: 0 } };
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
    model = this.inferenceModelDefault as ChatModel,
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
      max_completion_tokens: this.documentPipelineMaxCompletionTokens,
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
    model = this.inferenceModelDefault as ChatModel,
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
      max_completion_tokens: this.documentPipelineMaxCompletionTokens,
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
    statement,
    candidates,
    candidateRole,
    hint,
    model = this.inferenceModelDefault as ChatModel,
  }: GenerateStatementSupersessionJudgmentOptions): Promise<{
    candidateId: string | null;
    confidence: number;
    usage: OpenAiTokenUsage;
  }> {
    const candidateBlock = candidates
      .map((candidate, index) => `${index + 1}. [${candidate.id}] ${candidate.text}`)
      .join("\n");
    const comparisonPrompt =
      candidateRole === "prior"
        ? `New statement:\n${statement}\n\nCandidate prior statements, ordered nearest-first:\n${candidateBlock}`
        : `Prior statement:\n${statement}\n\nCandidate newer statements, ordered nearest-first:\n${candidateBlock}`;
    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: STATEMENT_SUPERSESSION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `${comparisonPrompt}${
            hint ? `\n\nThe new statement indicated it changes: ${hint}` : ""
          }\n\nReturn the first candidate that forms a true supersession with the fixed statement, or null.`,
        },
      ],
      max_completion_tokens: 4096,
      ...this.inferenceReasoningOptions,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "supersession_judgment",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              candidateId: { type: ["string", "null"] },
              confidence: { type: "number" },
            },
            required: ["candidateId", "confidence"],
          },
        },
      },
    });

    const raw = response.choices[0]?.message?.content;

    if (!raw) {
      throw new Error("No supersession judgment generated from OpenAI");
    }

    const parsed = JSON.parse(raw) as { candidateId: string | null; confidence: number };
    const candidateId = candidates.some((candidate) => candidate.id === parsed.candidateId) ? parsed.candidateId : null;

    return {
      candidateId,
      confidence: parsed.confidence,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  async generateStatementBatchSupersessionJudgments({
    items,
    model = this.inferenceModelDefault as ChatModel,
  }: GenerateStatementSupersessionJudgmentsOptions): Promise<{
    decisions: { candidateId: string | null; confidence: number }[];
    usage: OpenAiTokenUsage;
  }> {
    if (items.length === 0) {
      return { decisions: [], usage: { inputTokens: 0, outputTokens: 0 } };
    }

    const itemsBlock = items
      .map((item, index) => {
        const candidateBlock = item.candidates.length
          ? item.candidates
              .map((candidate, candidateIndex) => `  ${candidateIndex + 1}. [${candidate.id}] ${candidate.text}`)
              .join("\n")
          : "  (none)";
        const roleHeader =
          item.candidateRole === "prior"
            ? `New statement:\n${item.statement}\nCandidate prior statements, ordered nearest-first:\n${candidateBlock}`
            : `Prior statement:\n${item.statement}\nCandidate newer statements, ordered nearest-first:\n${candidateBlock}`;
        const hintSuffix = item.hint ? `\n\nThe new statement indicated it changes: ${item.hint}` : "";

        return `${index}. ${roleHeader}${hintSuffix}`;
      })
      .join("\n\n");

    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: STATEMENT_BATCH_SUPERSESSION_SYSTEM_PROMPT },
        { role: "user", content: `Statements:\n${itemsBlock}\n\nReturn the first qualifying candidateId per statement with confidence, or candidateId null.` },
      ],
      max_completion_tokens: 4096,
      ...this.inferenceReasoningOptions,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "statement_batch_supersession_judgments",
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
                    candidateId: { type: ["string", "null"] },
                    confidence: { type: "number" },
                  },
                  required: ["index", "candidateId", "confidence"],
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
      throw new Error("No statement batch supersession judgments generated from OpenAI");
    }

    let parsed: {
      decisions: {
        index: number;
        candidateId: string | null;
        confidence: number;
      }[];
    };

    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      // local models may emit thinking text or prose before the JSON; extract the first JSON object
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Failed to parse statement batch supersession judgments JSON from OpenAI response");
      }
      parsed = JSON.parse(jsonMatch[0]) as typeof parsed;
    }

    const decisions: { candidateId: string | null; confidence: number }[] = Array.from(
      { length: items.length },
      () => ({ candidateId: null, confidence: 0 }),
    );

    for (const decision of parsed.decisions) {
      if (!Number.isInteger(decision.index) || decision.index < 0 || decision.index >= items.length) {
        continue;
      }

      const selected = items[decision.index].candidates.find((candidate) => candidate.id === decision.candidateId);
      decisions[decision.index] = {
        candidateId: selected?.id ?? null,
        confidence: decision.confidence,
      };
    }

    return {
      decisions,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  async generateReferenceResolutionJudgment({
    referentText,
    expectation,
    candidates,
    model = this.inferenceModelDefault as ChatModel,
  }: GenerateReferenceResolutionJudgmentOptions): Promise<{
    candidateId: string | null;
    candidateKind: "document" | "statement" | null;
    resolution: "linked" | "contradicted";
    confidence: number;
    usage: OpenAiTokenUsage;
  }> {
    const candidateBlock = candidates
      .map((candidate, index) => `${index + 1}. [${candidate.kind}:${candidate.id}] ${candidate.text}`)
      .join("\n");
    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: REFERENCE_RESOLUTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Reference:\n${referentText}\n\nExpectation:\n${expectation}\n\nCandidates, ordered by resolution precedence and similarity:\n${candidateBlock}\n\nReturn the first candidate that clearly is the referent, or null.`,
        },
      ],
      max_completion_tokens: 4096,
      ...this.inferenceReasoningOptions,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "reference_resolution_judgment",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              candidateId: { type: ["string", "null"] },
              candidateKind: { type: ["string", "null"], enum: ["document", "statement", null] },
              resolution: { type: "string", enum: ["linked", "contradicted"] },
              confidence: { type: "number" },
            },
            required: ["candidateId", "candidateKind", "resolution", "confidence"],
          },
        },
      },
    });

    const raw = response.choices[0]?.message?.content;

    if (!raw) {
      throw new Error("No reference resolution judgment generated from OpenAI");
    }

    const parsed = JSON.parse(raw) as {
      candidateId: string | null;
      candidateKind: "document" | "statement" | null;
      resolution: "linked" | "contradicted";
      confidence: number;
    };

    const selected = candidates.find(
      (candidate) => candidate.id === parsed.candidateId && candidate.kind === parsed.candidateKind,
    );

    return {
      candidateId: selected?.id ?? null,
      candidateKind: selected?.kind ?? null,
      resolution: parsed.resolution,
      confidence: parsed.confidence,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  /**
   * Judges each action item's evidence candidates for decisive completion signals.
   * @param options - the numbered action items with their rendered candidates
   * @returns Validated decisions grouped per action item, plus how many were voided by the quote check.
   */
  async generateActionItemResolutionJudgments({
    actionItems,
    model = this.inferenceModelDefault as ChatModel,
  }: GenerateActionItemResolutionJudgmentsOptions): Promise<{
    decisionsByItem: ActionItemResolutionDecision[][];
    quoteRejections: number;
    usage: OpenAiTokenUsage;
  }> {
    if (actionItems.length === 0) {
      return { decisionsByItem: [], quoteRejections: 0, usage: { inputTokens: 0, outputTokens: 0 } };
    }

    const actionItemsBlock = actionItems
      .map((item, index) => {
        const candidates = item.candidates.length
          ? item.candidates.map((candidate) => `  [${candidate.kind}:${candidate.id}] ${candidate.text}`).join("\n")
          : "  (none)";

        return `${index}. Action item:\n${item.actionItem}\nEvidence candidates:\n${candidates}`;
      })
      .join("\n\n");
    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: ACTION_ITEM_BATCH_RESOLUTION_SYSTEM_PROMPT },
        { role: "user", content: `Action items:\n${actionItemsBlock}` },
      ],
      max_completion_tokens: ACTION_ITEM_RESOLUTION_MAX_COMPLETION_TOKENS,
      ...this.inferenceReasoningOptions,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "action_item_resolution_judgments",
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
                    candidateId: { type: "string" },
                    candidateKind: { type: "string", enum: ["document", "code"] },
                    verdict: { type: "string", enum: ["supports", "contradicts"] },
                    evidenceQuote: { type: "string" },
                    reason: { type: "string" },
                    confidence: { type: "number" },
                  },
                  required: [
                    "index",
                    "candidateId",
                    "candidateKind",
                    "verdict",
                    "evidenceQuote",
                    "reason",
                    "confidence",
                  ],
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
      throw new Error("No action-item resolution judgments generated from OpenAI");
    }

    const parsed = JSON.parse(raw) as {
      decisions: {
        index: number;
        candidateId: string;
        candidateKind: "document" | "code";
        verdict: "supports" | "contradicts";
        evidenceQuote: string;
        reason: string;
        confidence: number;
      }[];
    };
    const decisionsByItem: ActionItemResolutionDecision[][] = Array.from({ length: actionItems.length }, () => []);
    let quoteRejections = 0;

    for (const decision of parsed.decisions) {
      if (!Number.isInteger(decision.index) || decision.index < 0 || decision.index >= actionItems.length) {
        continue;
      }

      // a fabricated id, or a real id borrowed from another item in the same batch, is not a candidate for this item
      const selected = actionItems[decision.index].candidates.find(
        (candidate) => candidate.id === decision.candidateId && candidate.kind === decision.candidateKind,
      );

      if (!selected) {
        continue;
      }

      if (!evidenceQuoteOccursIn({ quote: decision.evidenceQuote, sources: [selected.text] })) {
        quoteRejections++;
        this.logger.warn(
          `Voided an action-item resolution decision whose quote is not verbatim in ${selected.kind} ${selected.id}: "${decision.evidenceQuote.slice(0, 120)}"`,
        );

        continue;
      }

      decisionsByItem[decision.index].push({
        candidateId: selected.id,
        candidateKind: selected.kind,
        verdict: decision.verdict,
        evidenceQuote: decision.evidenceQuote,
        reason: decision.reason,
        confidence: decision.confidence,
      });
    }

    return {
      decisionsByItem,
      quoteRejections,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  async _generateCurationDecisions({
    items,
    name,
    projectContext,
    documentType,
    systemPrompt,
    schemaName,
    itemLabel,
    model,
  }: {
    items: unknown[];
    name: string;
    projectContext?: string;
    documentType: string;
    systemPrompt: string;
    schemaName: string;
    itemLabel: string;
    model: ChatModel;
  }): Promise<{ decisions: { index: number; keep: boolean; reason: string }[]; usage: OpenAiTokenUsage }> {
    const decisions: { index: number; keep: boolean; reason: string }[] = [];
    const usage: OpenAiTokenUsage = { inputTokens: 0, outputTokens: 0 };

    const requestDecisions = async (requestItems: unknown[]) => {
      const numbered = requestItems.map((item, index) => `${index}. ${JSON.stringify(item)}`).join("\n");
      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Project context:\n${projectContext ?? "Not provided"}\n\nDocument type: ${documentType}\nDocument name: ${name}\n\n${itemLabel}:\n${numbered}`,
          },
        ],
        max_completion_tokens: CURATION_MAX_COMPLETION_TOKENS,
        ...this.inferenceReasoningOptions,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: schemaName,
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
      usage.inputTokens += response.usage?.prompt_tokens ?? 0;
      usage.outputTokens += response.usage?.completion_tokens ?? 0;

      const raw = response.choices[0]?.message?.content;
      if (!raw) return [];

      try {
        return (JSON.parse(raw) as { decisions: { index: number; keep: boolean; reason: string }[] }).decisions;
      } catch {
        return [];
      }
    };

    for (let offset = 0; offset < items.length; offset += CURATION_FILTER_BATCH_SIZE) {
      const batch = items.slice(offset, offset + CURATION_FILTER_BATCH_SIZE);
      const batchDecisions = await requestDecisions(batch);
      const decisionByIndex = new Map(
        batchDecisions
          .filter((decision) => Number.isInteger(decision.index) && decision.index >= 0 && decision.index < batch.length)
          .map((decision) => [decision.index, decision]),
      );

      const missingIndices = batch.map((_, index) => index).filter((index) => !decisionByIndex.has(index));
      if (missingIndices.length > 0) {
        this.logger.warn(
          `Incomplete ${schemaName} for ${name}: retrying ${missingIndices.length} omitted item(s) individually`,
        );
      }

      for (const missingIndex of missingIndices) {
        const retried = await requestDecisions([batch[missingIndex]]);
        const decision = retried.find((candidate) => candidate.index === 0);
        decisionByIndex.set(
          missingIndex,
          decision ?? { index: missingIndex, keep: false, reason: "Curation model omitted this item twice." },
        );
      }

      decisions.push(
        ...batch.map((_, index) => ({ ...decisionByIndex.get(index)!, index: index + offset })),
      );
    }

    return { decisions, usage };
  }

  /** Filters liberal statement extraction without allowing the curation model to rewrite facts or metadata. */
  async generateStatementCuration({
    statements,
    name,
    projectContext,
    documentType,
    model = this.inferenceModelDefault as ChatModel,
  }: GenerateStatementCurationOptions): Promise<{
    statements: (OpenAiDocumentExtraction["statements"][number] & { sourceIndices: number[] })[];
    usage: OpenAiTokenUsage;
  }> {
    if (statements.length === 0) {
      return { statements: [], usage: { inputTokens: 0, outputTokens: 0 } };
    }

    const { decisions, usage } = await this._generateCurationDecisions({
      items: statements,
      name,
      projectContext,
      documentType,
      systemPrompt: STATEMENT_CURATION_SYSTEM_PROMPT,
      schemaName: "statement_curation",
      itemLabel: "Extracted statements",
      model,
    });

    return {
      statements: decisions.flatMap((decision) =>
        decision.keep ? [{ ...statements[decision.index], sourceIndices: [decision.index] }] : [],
      ),
      usage,
    };
  }

  /** Filters actions separately because commitments have stricter evidence requirements than statements. */
  async generateActionItemCuration({
    actionItems,
    name,
    projectContext,
    documentType,
    model = this.inferenceModelDefault as ChatModel,
  }: GenerateActionItemCurationOptions): Promise<{
    actionItems: (OpenAiDocumentExtraction["actionItems"][number] & { sourceIndices: number[] })[];
    usage: OpenAiTokenUsage;
  }> {
    if (actionItems.length === 0) {
      return { actionItems: [], usage: { inputTokens: 0, outputTokens: 0 } };
    }

    const { decisions, usage } = await this._generateCurationDecisions({
      items: actionItems,
      name,
      projectContext,
      documentType,
      systemPrompt: ACTION_ITEM_CURATION_SYSTEM_PROMPT,
      schemaName: "action_item_curation",
      itemLabel: "Extracted action items",
      model,
    });

    return {
      actionItems: decisions.flatMap((decision) =>
        decision.keep ? [{ ...actionItems[decision.index], sourceIndices: [decision.index] }] : [],
      ),
      usage,
    };
  }

  /**
   * Groups a document's statements into a small set of doc-topics (docStatement -> docTopic).
   * Each group carries a name, type, and the indices of the input statements it contains.
   */
  async generateStatementGrouping({
    statements,
    types,
    model = this.inferenceModelDefault as ChatModel,
  }: GenerateStatementGroupingOptions): Promise<{ groups: OpenAiStatementGroup[]; usage: OpenAiTokenUsage }> {
    const numbered = statements.map((statement, index) => `${index}. ${statement}`).join("\n");

    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: STATEMENT_GROUPING_SYSTEM_PROMPT },
        { role: "user", content: `Statements:\n${numbered}` },
      ],
      max_completion_tokens: this.documentPipelineMaxCompletionTokens,
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

  async createProjectDocumentTopicGroups({
    projectTopicsExisting,
    projectDocumentTopics,
    model = this.inferenceModelDefault as ChatModel,
  }: GenerateTopicGroupingOptions): Promise<{ groups: OpenAiTopicGroup[]; usage: OpenAiTokenUsage }> {
    const projectTopicsExistingPromptSection = projectTopicsExisting.length
      ? projectTopicsExisting
          .map(
            (topic) =>
              `- id: ${topic.id}\n  name: ${topic.name}${topic.summary ? `\n  summary: ${topic.summary}` : ""}`,
          )
          .join("\n")
      : "(none yet)";

    const projectDocumentTopicsPromptSection = projectDocumentTopics
      .map(
        (topic) =>
          `- ${topic.name} [candidate ids: ${topic.candidateTopicIds?.length ? topic.candidateTopicIds.join(", ") : "none"}]` +
          (topic.statements.length
            ? `\n${topic.statements.map((statement) => `    ${statement}`).join("\n")}`
            : ""),
      )
      .join("\n");

    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: TOPIC_GROUPING_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Existing canonical topics:\n${projectTopicsExistingPromptSection}\n\nDoc-topics to place:\n${projectDocumentTopicsPromptSection}`,
        },
      ],
      max_completion_tokens: RECONCILIATION_GROUPING_MAX_COMPLETION_TOKENS,
      ...this.inferenceReasoningOptions,
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
                    type: { type: ["string", "null"], enum: [...Object.keys(ProjectTopicType), null] },
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

  async generateActionItemGrouping({
    existingActionItems,
    actionItems,
    model = this.inferenceModelDefault as ChatModel,
  }: GenerateActionItemGroupingOptions): Promise<{ groups: OpenAiActionItemGroup[]; usage: OpenAiTokenUsage }> {
    const existingBlock = existingActionItems.length
      ? existingActionItems
          .map(
            (item) =>
              `- id: ${item.id}\n  title: ${item.title}\n  description: ${item.description}` +
              (item.owner ? `\n  owner: ${item.owner}` : ""),
          )
          .join("\n")
      : "(none)";
    const itemsBlock = actionItems
      .map(
        (item, index) =>
          `${index}. ${item.description} (owner: ${item.owner}) [status: ${item.status}] ` +
          `[candidate ids: ${item.candidateActionItemIds.length ? item.candidateActionItemIds.join(", ") : "none"}]`,
      )
      .join("\n");

    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: ACTION_ITEM_GROUPING_SYSTEM_PROMPT },
        { role: "user", content: `Existing canonical action items:\n${existingBlock}\n\nNew items:\n${itemsBlock}` },
      ],
      max_completion_tokens: ACTION_ITEM_GROUPING_MAX_COMPLETION_TOKENS,
      ...this.inferenceReasoningOptions,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "action_item_grouping",
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
                    matchActionItemId: { type: ["string", "null"] },
                    title: { type: "string" },
                    description: { type: "string" },
                    owner: { type: ["string", "null"] },
                    memberIndices: { type: "array", items: { type: "integer" } },
                  },
                  required: ["matchActionItemId", "title", "description", "owner", "memberIndices"],
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
      throw new Error("No action item grouping generated from OpenAI");
    }

    const parsed = JSON.parse(raw) as { groups: OpenAiActionItemGroup[] };

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
    actionContent = content,
    name,
    projectContext,
    documentType,
    enums,
    model = this.inferenceModelDefault as ChatModel,
  }: GenerateDocumentExtractionOptions): Promise<{ extraction: OpenAiDocumentExtraction; usage: OpenAiTokenUsage }> {
    const statementChunks = chunkTextByTokens({ text: content, maxTokens: this.documentExtractionChunkTokens });
    const actionChunks = chunkTextByTokens({ text: actionContent, maxTokens: this.documentExtractionChunkTokens });
    const chunks: DocumentExtractionChunkOptions[] = [
      ...statementChunks.map((chunk) => ({
        content: chunk,
        name,
        projectContext,
        documentType,
        enums,
        model,
        extractionTarget: "statements" as const,
      })),
      ...actionChunks.map((chunk) => ({
        content: chunk,
        name,
        projectContext,
        documentType,
        enums,
        model,
        extractionTarget: "actions" as const,
      })),
    ];
    this.logger.log(
      `Document extraction for ${name}: ${statementChunks.length} statement chunk(s), ${actionChunks.length} action chunk(s), ${this.documentExtractionChunkTokens} input tokens/chunk, ${this.documentPipelineMaxCompletionTokens} max completion tokens, inference concurrency ${this.inferenceConcurrency}, reasoning ${this.inferenceReasoningOptions.reasoning_effort ?? "endpoint default"}`,
    );

    // Local inference servers generally execute one generation at a time. Avoid filling their queue with long chunk
    // requests that all age toward the client timeout before they begin. Remote providers may still run chunks in parallel.
    const chunkResults = [];
    if (this.inferenceConcurrency === 1) {
      for (const chunk of chunks) {
        chunkResults.push(
          ...(await this._extractDocumentChunkWithFallback(
            chunk,
            this.documentExtractionChunkTokens,
          )),
        );
      }
    } else {
      chunkResults.push(
        ...(
          await Promise.all(
            chunks.map((chunk) =>
              this._extractDocumentChunkWithFallback(chunk, this.documentExtractionChunkTokens),
            ),
          )
        ).flat(),
      );
    }

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

  async _extractDocumentChunkWithFallback(
    options: DocumentExtractionChunkOptions,
    chunkTokenLimit: number,
  ): Promise<{ extraction: OpenAiDocumentExtraction; usage: OpenAiTokenUsage }[]> {
    try {
      return [await this._extractDocumentChunk(options)];
    } catch (error) {
      if (!(error instanceof InvalidDocumentExtractionResponseError) || chunkTokenLimit <= 375) throw error;

      const smallerTokenLimit = Math.max(375, Math.floor(chunkTokenLimit / 2));
      const smallerChunks = chunkTextByTokens({ text: options.content, maxTokens: smallerTokenLimit });
      if (smallerChunks.length < 2) throw error;

      this.logger.warn(
        `Extraction request failed or returned truncated JSON for ${options.name}; retrying this chunk as ${smallerChunks.length} chunk(s) of at most ${smallerTokenLimit} tokens`,
      );

      const results = [];
      for (const content of smallerChunks) {
        results.push(
          ...(await this._extractDocumentChunkWithFallback({ ...options, content }, smallerTokenLimit)),
        );
      }
      return results;
    }
  }

  async _extractDocumentChunk({
    content,
    name,
    projectContext,
    documentType,
    enums,
    extractionTarget,
    model = this.inferenceModelDefault as ChatModel,
  }: DocumentExtractionChunkOptions): Promise<{ extraction: OpenAiDocumentExtraction; usage: OpenAiTokenUsage }> {
    if (extractionTarget === "statements") {
      const result = await this._extractStatementsAndTopics({
        content,
        name,
        projectContext,
        documentType,
        enums,
        model,
      });
      return {
        extraction: { topics: result.topics, statements: result.statements, actionItems: [], references: [] },
        usage: result.usage,
      };
    }

    const result = await this._extractActionsAndReferences({
      content,
      name,
      projectContext,
      documentType,
      enums,
      model,
    });
    return {
      extraction: {
        topics: [],
        statements: [],
        actionItems: result.actionItems,
        references: result.references,
      },
      usage: result.usage,
    };
  }

  async _extractStatementsAndTopics({
    content,
    name,
    projectContext,
    documentType,
    enums,
    model = this.inferenceModelDefault as ChatModel,
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
          content: `Project context:\n${projectContext ?? "Not provided"}\n\nDocument type: ${documentType}\nDocument name: ${name}\n\nContent:\n${content}`,
        },
      ],
      // gpt-5-mini is a reasoning model: it rejects a custom temperature and bills reasoning against the completion budget
      max_completion_tokens: this.documentPipelineMaxCompletionTokens,
      ...this.inferenceReasoningOptions,
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
                    actor: {
                      type: ["string", "null"],
                      description:
                        "who made or is responsible for the statement - their role/title if the document establishes roles, else their name, else null",
                    },
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

    if (!raw) {
      throw new InvalidDocumentExtractionResponseError(
        `No statement extraction JSON for ${name}; finish reason: ${response.choices[0]?.finish_reason ?? "unknown"}`,
      );
    }

    let parsed: Pick<OpenAiDocumentExtraction, "topics" | "statements">;
    try {
      parsed = JSON.parse(raw) as Pick<OpenAiDocumentExtraction, "topics" | "statements">;
    } catch {
      throw new InvalidDocumentExtractionResponseError(
        `Invalid statement extraction JSON for ${name}; ${raw.length} characters, finish reason: ${response.choices[0]?.finish_reason ?? "unknown"}`,
      );
    }

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
    projectContext,
    documentType,
    enums,
    model = this.inferenceModelDefault as ChatModel,
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
          content: `Project context:\n${projectContext ?? "Not provided"}\n\nDocument type: ${documentType}\nDocument name: ${name}\n\nContent:\n${content}`,
        },
      ],
      max_completion_tokens: this.documentPipelineMaxCompletionTokens,
      ...this.inferenceReasoningOptions,
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

    if (!raw) {
      throw new InvalidDocumentExtractionResponseError(
        `No action extraction JSON for ${name}; finish reason: ${response.choices[0]?.finish_reason ?? "unknown"}`,
      );
    }

    let parsed: Pick<OpenAiDocumentExtraction, "actionItems" | "references">;
    try {
      parsed = JSON.parse(raw) as Pick<OpenAiDocumentExtraction, "actionItems" | "references">;
    } catch {
      throw new InvalidDocumentExtractionResponseError(
        `Invalid action extraction JSON for ${name}; ${raw.length} characters, finish reason: ${response.choices[0]?.finish_reason ?? "unknown"}`,
      );
    }

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
    model = this.inferenceModelDefault as ChatModel,
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
      max_completion_tokens: this.documentPipelineMaxCompletionTokens,
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
    model = this.inferenceModelDefault as ChatModel,
  }: OpenAiGenerateProjectSummaryOptions): Promise<{ summary: string; usage: OpenAiTokenUsage }> {
    const prompt = this._buildProjectSummaryPrompt({ projectName, topLevelDirectorySummaries });

    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      max_completion_tokens: this.documentPipelineMaxCompletionTokens,
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
