import { Injectable, Logger } from "@nestjs/common";
import {
  Prisma,
  ProjectActionItemStatusSource,
  ProjectDataOrigin,
  ProjectDocumentActionItemStatus,
  ProjectDocumentDecisionStatus,
  ProjectDocumentImplementationStatus,
  ProjectDocumentReferenceResolution,
  ProjectDocumentStatementType,
  ProjectTopicType,
} from "@prisma/client";
import type { ProjectDocumentStatement, ProjectTopic } from "@prisma/client";
import { encode } from "gpt-tokenizer/cjs/encoding/o200k_base";
import { PrismaService } from "../../prisma/prisma.service";
import { OpenAIService } from "../openai/openai.service";
import { ProjectCorrectionService } from "../project-correction/project-correction.service";
import type { ProjectReconcileResult } from "./types/project-reconcile-result.type";
import type { ProjectReconcileStatementState } from "./types/project-reconcile-statement-state.type";
import type { ActionItemResolutionEvidence } from "./types/action-item-resolution-evidence.type";

// raised from 0.6 after a seed inspection showed the judge over-linking relatedness/strategy as supersession (F16)
const SUPERSESSION_CONFIDENCE_THRESHOLD = 0.75;
const SUPERSESSION_CANDIDATE_LIMIT = 5;

// resolution (references + action-item status) mirrors the supersession pattern: nearest candidates then an llm judgment
const RESOLUTION_CONFIDENCE_THRESHOLD = 0.6;
const RESOLUTION_CANDIDATE_LIMIT = 5;

// member statements sampled per doc-topic for the grouping prompt and drop-routing embeddings (keeps prompts bounded)
const TOPIC_MEMBER_STATEMENT_SAMPLE = 8;
const TOPIC_GROUPING_BATCH_SIZE = 10;
const TOPIC_GROUPING_BATCH_TOKENS = 3000;
const TOPIC_CANDIDATE_LIMIT = 3;

// Action-item canonicalization must stay bounded as a project grows. Items are processed chronologically so the
// canonical rows created for one document become anchors for later documents, while both item count and token count
// cap every inference request.
const ACTION_ITEM_GROUPING_BATCH_SIZE = 20;
const ACTION_ITEM_GROUPING_BATCH_TOKENS = 6000;
const ACTION_ITEM_CANDIDATE_LIMIT = 3;
const ACTION_ITEM_RESOLUTION_BATCH_SIZE = 10;

@Injectable()
export class ProjectReconcileService {
  readonly logger = new Logger(ProjectReconcileService.name);

  constructor(
    readonly prisma: PrismaService,
    readonly openaiService: OpenAIService,
    readonly projectCorrectionService: ProjectCorrectionService,
  ) {}

  /** applies corrections and builds only the durable topic/action-item canonical layer. */
  async canonicalize(
    projectId: string,
  ): Promise<
    Pick<
      ProjectReconcileResult,
      "correctionsApplied" | "topicsCreated" | "topicsMatched" | "actionItemsCreated" | "actionItemsMatched"
    >
  > {
    this.logger.log(`Canonicalizing project ${projectId}`);

    const { correctionsApplied } = await this.projectCorrectionService.correctionsApply(projectId);
    const { topicsCreated, topicsMatched } = await this._canonicalizeProjectTopics(projectId);
    const { actionItemsCreated, actionItemsMatched } = await this._canonicalizeActionItems(projectId);

    return { correctionsApplied, topicsCreated, topicsMatched, actionItemsCreated, actionItemsMatched };
  }

  async resolveActionItemStatuses(projectId: string): Promise<{ actionItemsResolved: number }> {
    this.logger.log(`Resolving canonical action-item statuses for project ${projectId}`);

    return this._resolveCanonicalActionItemStatus(projectId);
  }

  async reconcile(projectId: string): Promise<ProjectReconcileResult> {
    const startedAt = Date.now();
    const concurrency = this.openaiService.configService.get<number>("RECONCILE_CONCURRENCY", 1);
    this.logger.log(`Reconciling project ${projectId}`);

    const { correctionsApplied, topicsCreated, topicsMatched, actionItemsCreated, actionItemsMatched } =
      await this.canonicalize(projectId);

    const statements = await this.prisma.projectDocumentStatement.findMany({
      where: { projectId, suppressed: false },
      orderBy: { occurredAt: "asc" },
    });

    this.logger.log(`Threading ${statements.length} statements`);

    // start every statement from its local (extraction-time) state - validFrom set, nothing superseded
    const desiredStates = new Map<string, ProjectReconcileStatementState>();

    for (const statement of statements) {
      // a human-edited statement keeps its human-set state; otherwise restore the extraction-time state
      const local =
        statement.origin === ProjectDataOrigin.human
          ? { decisionStatus: statement.decisionStatus, implementationStatus: statement.implementationStatus }
          : this._localStatuses(statement);
      desiredStates.set(statement.id, {
        validFrom: statement.occurredAt,
        validUntil: null,
        decisionStatus: local.decisionStatus,
        implementationStatus: local.implementationStatus,
        replacesPriorStatementId: null,
        replacedByStatementId: null,
      });
    }

    let supersessionsLinked = 0;

    // Embed all local replacement hints in one request, then judge each statement's full candidate set in one call.
    const hintStatements = statements.filter((statement) => Boolean(statement.replacesPriorStatementText));
    const { embeddings: hintEmbeddings } = await this.openaiService.generateEmbeddings(
      hintStatements.map((statement) => statement.replacesPriorStatementText!),
    );
    const hintResults = await this._mapWithConcurrency(hintStatements, concurrency, (statement, index) =>
      this._findSupersededStatement({ projectId, statement, embedding: hintEmbeddings[index] }),
    );

    // thread each hint-carrying statement onto the prior statement it replaces
    for (let index = 0; index < hintStatements.length; index++) {
      const statement = hintStatements[index];
      const prior = hintResults[index];

      if (!prior) {
        continue;
      }

      const newState = desiredStates.get(statement.id);
      const priorState = desiredStates.get(prior.id);

      if (!newState || !priorState) {
        continue;
      }

      newState.replacesPriorStatementId = prior.id;
      priorState.replacedByStatementId = statement.id;
      priorState.decisionStatus = ProjectDocumentDecisionStatus.superseded;
      priorState.validUntil = statement.occurredAt;
      supersessionsLinked++;
    }

    // cross-document current-state: extraction only sets replacesPriorStatementText within a single document, so a
    // proposal/decision overturned by a LATER document (e.g. a proposal made in one meeting, rejected in the next) is
    // missed by the hint pass above. for each still-live proposal/decision, look forward for a statement that reverses it.
    const overturningSources = statements.filter((statement) => {
      const state = desiredStates.get(statement.id);

      const isProposalOrDecision =
        statement.type === ProjectDocumentStatementType.proposal ||
        statement.type === ProjectDocumentStatementType.decision;

      // skip non-proposals, and any already threaded by the hint pass (superseded, or a superseder of a prior)
      return !(
        !state ||
        !isProposalOrDecision ||
        state.decisionStatus === ProjectDocumentDecisionStatus.superseded ||
        Boolean(state.replacedByStatementId) ||
        Boolean(state.replacesPriorStatementId)
      );
    });
    const overturningResults = await this._mapWithConcurrency(overturningSources, concurrency, (statement) =>
      this._findOverturningStatement({ projectId, statement }),
    );

    for (let index = 0; index < overturningSources.length; index++) {
      const statement = overturningSources[index];
      const overturner = overturningResults[index];
      const state = desiredStates.get(statement.id);

      if (!overturner || !state) {
        continue;
      }

      const overturnerState = desiredStates.get(overturner.id);

      if (!overturnerState) {
        continue;
      }

      state.replacedByStatementId = overturner.id;
      state.decisionStatus = ProjectDocumentDecisionStatus.superseded;
      state.validUntil = overturner.occurredAt;

      // reciprocal link only if the overturner is not already threaded onto an earlier statement
      overturnerState.replacesPriorStatementId ??= statement.id;

      supersessionsLinked++;
    }

    // virtual reset: apply the fully-computed state in one atomic transaction (no destructive pre-wipe)
    const updates: Prisma.PrismaPromise<ProjectDocumentStatement>[] = [];

    for (const statement of statements) {
      const state = desiredStates.get(statement.id);

      if (!state) {
        continue;
      }

      updates.push(
        this.prisma.projectDocumentStatement.update({
          where: { id: statement.id },
          data: {
            validFrom: state.validFrom,
            validUntil: state.validUntil,
            decisionStatus: state.decisionStatus,
            implementationStatus: state.implementationStatus,
            replacesPriorStatementId: state.replacesPriorStatementId,
            replacedByStatementId: state.replacedByStatementId,
          },
        }),
      );
    }

    await this.prisma.$transaction(updates);

    // materialize reference links now that the statement/topic graph is stable
    const { referencesResolved } = await this._resolveReferences(projectId);

    // set each canonical action item's status from the best available document/code signal
    const { actionItemsResolved } = await this._resolveCanonicalActionItemStatus(projectId);

    this.logger.log(
      `Reconcile complete for project ${projectId} in ${Date.now() - startedAt}ms: ${correctionsApplied} corrections applied, ${topicsCreated} topics created, ${topicsMatched} matched, ${actionItemsCreated} action items created, ${actionItemsMatched} matched, ${supersessionsLinked} supersessions linked, ${referencesResolved} references resolved, ${actionItemsResolved} action items resolved`,
    );

    return {
      projectId,
      correctionsApplied,
      topicsCreated,
      topicsMatched,
      statementsReconciled: statements.length,
      supersessionsLinked,
      actionItemsCreated,
      actionItemsMatched,
      referencesResolved,
      actionItemsResolved,
    };
  }

  async _mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    const workerCount = Math.min(Math.max(1, concurrency), items.length);

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (nextIndex < items.length) {
          const index = nextIndex++;
          results[index] = await mapper(items[index], index);
        }
      }),
    );

    return results;
  }

  /** Canonicalizes unlinked document topics in bounded batches while preserving stable canonical topic ids. */
  async _canonicalizeProjectTopics(projectId: string): Promise<{ topicsCreated: number; topicsMatched: number }> {
    const documentTopics = await this.prisma.projectDocumentTopic.findMany({
      where: { projectId, projectTopicId: null },
      orderBy: [{ projectDocument: { occurredAt: "asc" } }, { createdAt: "asc" }],
      select: { id: true, name: true },
    });

    if (documentTopics.length === 0) {
      return { topicsCreated: 0, topicsMatched: 0 };
    }

    const projectDocumentTopicNamesDistinct = [...new Set(documentTopics.map((documentTopic) => documentTopic.name))];

    this.logger.log(
      `Canonicalizing ${projectDocumentTopicNamesDistinct.length} distinct topics from ${documentTopics.length} doc-topics`,
    );

    // sample each distinct topic's statements once
    const projectDocumentStatementsByTopicName = await this._getProjectDocumentStatementsByProjectDocumentTopicName({
      projectId,
      names: projectDocumentTopicNamesDistinct,
    });
    const batches = this._buildBoundedTopicNameBatches(
      projectDocumentTopicNamesDistinct,
      projectDocumentStatementsByTopicName,
    );
    const matchedTopicIds = new Set<string>();
    let topicsCreated = 0;
    let topicNamesLinked = 0;

    this.logger.log(
      `Placing ${projectDocumentTopicNamesDistinct.length} distinct topics in ${batches.length} bounded batch(es)`,
    );

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const names = batches[batchIndex];
      const { embeddings } = await this.openaiService.generateEmbeddings(
        names.map((name) => [name, ...(projectDocumentStatementsByTopicName.get(name) ?? [])].join("\n")),
      );
      const candidateSets = await this._mapWithConcurrency(names, 4, (_, nameIndex) =>
        this._findNearestTopicAnchors({ projectId, embedding: embeddings[nameIndex] }),
      );
      const candidateIds = [...new Set(candidateSets.flat().map((candidate) => candidate.id))];
      const projectTopicsExisting =
        candidateIds.length > 0
          ? await this.prisma.projectTopic.findMany({ where: { projectId, id: { in: candidateIds } } })
          : [];
      const candidateTopicIdsByName = new Map(
        names.map((name, nameIndex) => [name, candidateSets[nameIndex].map((candidate) => candidate.id)]),
      );
      this.logger.log(
        `Topic batch ${batchIndex + 1}/${batches.length}: grouping ${names.length} topic(s) against ${projectTopicsExisting.length} candidate anchor(s)`,
      );
      const { newTopicPayloads, matches } = await this._createOrLinkProjectTopics({
        projectDocumentTopicNamesDistinct: names,
        projectDocumentStatementsByTopicName,
        projectTopicsExisting,
        candidateTopicIdsByName,
      });
      const topicIdByName = new Map<string, string>();

      for (const match of matches) {
        topicIdByName.set(match.name, match.topicId);
        matchedTopicIds.add(match.topicId);
      }

      await this.prisma.$transaction(
        async (tx) => {
          for (const payload of newTopicPayloads) {
            const topic = await tx.projectTopic.create({
              data: { projectId, name: payload.name, type: payload.type, summary: payload.summary },
            });

            await tx.$executeRaw`
              UPDATE "ProjectTopic"
              SET "summaryEmbedding" = ${`[${payload.embedding.join(",")}]`}::halfvec
              WHERE id = ${topic.id}::uuid
            `;

            for (const memberName of payload.memberNames) {
              topicIdByName.set(memberName, topic.id);
            }
          }

          for (const [name, topicId] of topicIdByName) {
            const updated = await tx.projectDocumentTopic.updateMany({
              where: { projectId, projectTopicId: null, name },
              data: { projectTopicId: topicId },
            });
            topicNamesLinked += updated.count;
          }
        },
        { timeout: 30000 },
      );

      topicsCreated += newTopicPayloads.length;
      this.logger.log(
        `Topic batch ${batchIndex + 1}/${batches.length}: placed ${names.length}, matched ${matches.length}, created ${newTopicPayloads.length}`,
      );
    }

    this.logger.log(
      `Folded ${topicNamesLinked} doc-topics into ${matchedTopicIds.size} existing topics, created ${topicsCreated} new topics`,
    );

    return { topicsCreated, topicsMatched: matchedTopicIds.size };
  }

  _buildBoundedTopicNameBatches(names: string[], statementsByName: Map<string, string[]>): string[][] {
    const batches: string[][] = [];
    let current: string[] = [];
    let currentTokens = 0;

    for (const name of names) {
      const topicTokens = encode([name, ...(statementsByName.get(name) ?? [])].join("\n")).length;
      const exceedsCount = current.length >= TOPIC_GROUPING_BATCH_SIZE;
      const exceedsTokens = current.length > 0 && currentTokens + topicTokens > TOPIC_GROUPING_BATCH_TOKENS;

      if (exceedsCount || exceedsTokens) {
        batches.push(current);
        current = [];
        currentTokens = 0;
      }

      current.push(name);
      currentTokens += topicTokens;
    }

    if (current.length > 0) {
      batches.push(current);
    }

    return batches;
  }

  // samples up to TOPIC_MEMBER_STATEMENT_SAMPLE textDerived statements per topic name, for embedding and prompts
  async _getProjectDocumentStatementsByProjectDocumentTopicName({
    projectId,
    names,
  }: {
    projectId: string;
    names: string[];
  }): Promise<Map<string, string[]>> {
    const statements = await this.prisma.projectDocumentStatement.findMany({
      where: { projectId, projectDocumentTopic: { name: { in: names } } },
      select: { textDerived: true, projectDocumentTopic: { select: { name: true } } },
    });

    const statementsByName = new Map<string, string[]>();

    for (const statement of statements) {
      const texts = statementsByName.get(statement.projectDocumentTopic.name) ?? [];

      if (texts.length < TOPIC_MEMBER_STATEMENT_SAMPLE) {
        texts.push(statement.textDerived);
      }

      statementsByName.set(statement.projectDocumentTopic.name, texts);
    }

    return statementsByName;
  }

  async _findNearestTopicAnchors({
    projectId,
    embedding,
  }: {
    projectId: string;
    embedding: number[];
  }): Promise<{ id: string; name: string; summary: string | null; distance: number }[]> {
    const rows = await this.prisma.$queryRaw<{ id: string; name: string; summary: string | null; distance: number }[]>`
      SELECT id, name, summary, ("summaryEmbedding" <=> ${`[${embedding.join(",")}]`}::halfvec) AS distance
      FROM "ProjectTopic"
      WHERE "projectId" = ${projectId}::uuid
        AND "summaryEmbedding" IS NOT NULL
      ORDER BY distance ASC
      LIMIT ${TOPIC_CANDIDATE_LIMIT}
    `;

    return rows;
  }

  async _createOrLinkProjectTopics({
    projectDocumentTopicNamesDistinct,
    projectDocumentStatementsByTopicName,
    projectTopicsExisting,
    candidateTopicIdsByName,
  }: {
    projectDocumentTopicNamesDistinct: string[];
    projectDocumentStatementsByTopicName: Map<string, string[]>;
    projectTopicsExisting: ProjectTopic[];
    candidateTopicIdsByName: Map<string, string[]>;
  }): Promise<{
    newTopicPayloads: {
      name: string;
      type: ProjectTopicType | null;
      summary: string;
      embedding: number[];
      memberNames: string[];
    }[];
    matches: { name: string; topicId: string }[];
  }> {
    const { groups } = await this.openaiService.createProjectDocumentTopicGroups({
      projectTopicsExisting: projectTopicsExisting,
      projectDocumentTopics: projectDocumentTopicNamesDistinct.map((name) => ({
        name,
        statements: projectDocumentStatementsByTopicName.get(name) ?? [],
        candidateTopicIds: candidateTopicIdsByName.get(name) ?? [],
      })),
    });

    const projectDocumentTopicNamesDistinctSet = new Set(projectDocumentTopicNamesDistinct);
    const projectTopicExistingIds = new Set(projectTopicsExisting.map((topic) => topic.id));
    const placedNames = new Set<string>();
    const newTopicPayloads: {
      name: string;
      type: ProjectTopicType | null;
      summary: string;
      embedding: number[];
      memberNames: string[];
    }[] = [];
    const matches: { name: string; topicId: string }[] = [];

      // keep only real input names per group (the model can echo or invent), each placed once
    for (const group of groups) {
      const memberNames = [...new Set(group.memberNames)].filter(
        (name) => projectDocumentTopicNamesDistinctSet.has(name) && !placedNames.has(name),
      );

      if (memberNames.length === 0) {
        continue;
      }

      memberNames.forEach((name) => placedNames.add(name));

      // fold into an existing canonical topic when the model matched one; its summary is left untouched
      const matchesEveryMembersCandidateSet = Boolean(
        group.matchTopicId &&
          memberNames.every((name) => candidateTopicIdsByName.get(name)?.includes(group.matchTopicId!)),
      );

      if (group.matchTopicId && projectTopicExistingIds.has(group.matchTopicId) && matchesEveryMembersCandidateSet) {
        for (const name of memberNames) {
          matches.push({ name, topicId: group.matchTopicId });
        }

        continue;
      }

      // otherwise this is a new canonical topic - embed its summary so future runs can fold into it
      const type = (Object.values(ProjectTopicType) as string[]).includes(group.type ?? "")
        ? (group.type as ProjectTopicType)
        : null;

      const { embedding } = await this.openaiService.generateEmbedding({ input: group.summary });

      newTopicPayloads.push({ name: group.name, type, summary: group.summary, embedding, memberNames });
    }

    // Preserve an omitted name as a singleton rather than guessing a potentially destructive merge.
    for (const name of projectDocumentTopicNamesDistinct) {
      if (placedNames.has(name)) {
        continue;
      }

      placedNames.add(name);

      const { embedding } = await this.openaiService.generateEmbedding({
        input: [name, ...(projectDocumentStatementsByTopicName.get(name) ?? [])].join("\n"),
      });

      newTopicPayloads.push({ name, type: null, summary: name, embedding, memberNames: [name] });
    }

    return { newTopicPayloads, matches };
  }

  /**
   * Canonicalizes the project's per-document action items into durable ProjectActionItems, deduping restatements across
   * documents. Existing canonical items are anchors that doc-level items fold into (a clear match) or seed new ones from.
   * A canonical item left with no members after the fold is flagged stale (surfaced, never deleted). Applied in one
   * transaction so ids stay stable and a human-pinned item keeps its status untouched across re-extraction.
   * @param projectId - the project whose action items to canonicalize
   */
  async _canonicalizeActionItems(
    projectId: string,
  ): Promise<{ actionItemsCreated: number; actionItemsMatched: number }> {
    const documentActionItems = await this.prisma.projectDocumentActionItem.findMany({
      where: { projectId, suppressed: false, projectActionItemId: null },
      orderBy: [{ projectDocument: { occurredAt: "asc" } }, { createdAt: "asc" }],
      select: {
        id: true,
        description: true,
        owner: true,
        status: true,
        projectDocumentId: true,
      },
    });

    if (documentActionItems.length === 0) {
      await this._refreshCanonicalActionItemStaleness(projectId);
      return { actionItemsCreated: 0, actionItemsMatched: 0 };
    }

    const batches = this._buildBoundedActionItemBatches(documentActionItems);
    const matchedCanonicalIds = new Set<string>();
    let actionItemsCreated = 0;
    let actionItemsLinked = 0;

    this.logger.log(
      `Canonicalizing ${documentActionItems.length} unlinked doc-level action items in ${batches.length} bounded batch(es)`,
    );

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const { embeddings } = await this.openaiService.generateEmbeddings(
        batch.map((item) => `${item.owner}\n${item.description}`),
      );
      const candidateSets = await this._mapWithConcurrency(batch, 4, (_, itemIndex) =>
        this._findNearestActionItemAnchors({ projectId, embedding: embeddings[itemIndex] }),
      );
      const candidateIds = [...new Set(candidateSets.flat().map((candidate) => candidate.id))];
      const existingActionItems =
        candidateIds.length > 0
          ? await this.prisma.projectActionItem.findMany({
              where: { projectId, id: { in: candidateIds } },
              select: { id: true, title: true, description: true, owner: true },
            })
          : [];
      const existingActionItemById = new Map(existingActionItems.map((item) => [item.id, item]));
      this.logger.log(
        `Action-item batch ${batchIndex + 1}/${batches.length}: judging ${batch.length} item(s) against ${existingActionItems.length} candidate anchor(s)`,
      );
      const groups = await this._generateActionItemGroupsWithFallback({
        batch,
        candidateSets,
        existingActionItems,
        existingActionItemById,
      });
      const { matches, newActionItemPayloads } = this._buildActionItemsFromGrouping({
        actionItems: batch,
        embeddings,
        groups,
        candidateActionItemIdsByIndex: candidateSets.map((candidates) => candidates.map((candidate) => candidate.id)),
        existingActionItemIds: new Set(existingActionItems.map((item) => item.id)),
      });

      await this.prisma.$transaction(
        async (tx) => {
          const canonicalIdByMemberIndex = new Map<number, string>();

          for (const payload of newActionItemPayloads) {
            const created = await tx.projectActionItem.create({
              data: { projectId, title: payload.title, description: payload.description, owner: payload.owner },
            });

            await tx.$executeRaw`
              UPDATE "ProjectActionItem"
              SET "summaryEmbedding" = ${`[${payload.embedding.join(",")}]`}::halfvec
              WHERE id = ${created.id}::uuid
            `;

            for (const memberIndex of payload.memberIndices) {
              canonicalIdByMemberIndex.set(memberIndex, created.id);
            }
          }

          for (const match of matches) {
            canonicalIdByMemberIndex.set(match.memberIndex, match.actionItemId);
            matchedCanonicalIds.add(match.actionItemId);
          }

          for (let itemIndex = 0; itemIndex < batch.length; itemIndex++) {
            const canonicalId = canonicalIdByMemberIndex.get(itemIndex);

            if (!canonicalId) {
              continue;
            }

            await tx.projectDocumentActionItem.update({
              where: { id: batch[itemIndex].id },
              data: { projectActionItemId: canonicalId },
            });
            actionItemsLinked++;
          }
        },
        { timeout: 30000 },
      );

      actionItemsCreated += newActionItemPayloads.length;
      this.logger.log(
        `Action-item batch ${batchIndex + 1}/${batches.length}: linked ${batch.length}, matched ${matches.length}, created ${newActionItemPayloads.length}`,
      );
    }

    await this._refreshCanonicalActionItemStaleness(projectId);
    this.logger.log(
      `Folded ${actionItemsLinked} doc-level action items into ${matchedCanonicalIds.size} existing canonical items, created ${actionItemsCreated} new`,
    );

    return { actionItemsCreated, actionItemsMatched: matchedCanonicalIds.size };
  }

  _buildBoundedActionItemBatches<
    T extends { description: string; owner: string; projectDocumentId?: string },
  >(items: T[]): T[][] {
    const batches: T[][] = [];
    let current: T[] = [];
    let currentTokens = 0;

    for (const item of items) {
      const itemTokens = encode(`${item.owner}\n${item.description}`).length;
      const exceedsCount = current.length >= ACTION_ITEM_GROUPING_BATCH_SIZE;
      const exceedsTokens = current.length > 0 && currentTokens + itemTokens > ACTION_ITEM_GROUPING_BATCH_TOKENS;
      if (exceedsCount || exceedsTokens) {
        batches.push(current);
        current = [];
        currentTokens = 0;
      }

      current.push(item);
      currentTokens += itemTokens;
    }

    if (current.length > 0) {
      batches.push(current);
    }

    return batches;
  }

  // local OpenAI-compatible endpoints can occasionally return a truncated JSON object even below the completion cap.
  // Retry only malformed JSON as two smaller independent groups; network/model failures still propagate normally.
  async _generateActionItemGroupsWithFallback({
    batch,
    candidateSets,
    existingActionItems,
    existingActionItemById,
  }: {
    batch: { description: string; owner: string; status: ProjectDocumentActionItemStatus }[];
    candidateSets: { id: string }[][];
    existingActionItems: { id: string; title: string; description: string; owner: string | null }[];
    existingActionItemById: Map<string, { id: string; title: string; description: string; owner: string | null }>;
  }): Promise<
    {
      matchActionItemId: string | null;
      title: string;
      description: string;
      owner: string | null;
      memberIndices: number[];
    }[]
  > {
    try {
      const { groups } = await this.openaiService.generateActionItemGrouping({
        existingActionItems,
        actionItems: batch.map((item, index) => ({
          description: item.description,
          owner: item.owner,
          status: item.status,
          candidateActionItemIds: candidateSets[index]
            .map((candidate) => candidate.id)
            .filter((id) => existingActionItemById.has(id)),
        })),
      });

      return groups;
    } catch (error) {
      if (!(error instanceof SyntaxError) || batch.length === 1) {
        throw error;
      }

      const splitAt = Math.ceil(batch.length / 2);
      this.logger.warn(
        `Invalid action-item grouping JSON for ${batch.length} items; retrying as ${splitAt} and ${batch.length - splitAt} items`,
      );
      const firstGroups = await this._generateActionItemGroupsWithFallback({
        batch: batch.slice(0, splitAt),
        candidateSets: candidateSets.slice(0, splitAt),
        existingActionItems,
        existingActionItemById,
      });
      const secondGroups = await this._generateActionItemGroupsWithFallback({
        batch: batch.slice(splitAt),
        candidateSets: candidateSets.slice(splitAt),
        existingActionItems,
        existingActionItemById,
      });

      return [
        ...firstGroups,
        ...secondGroups.map((group) => ({
          ...group,
          memberIndices: group.memberIndices.map((index) => index + splitAt),
        })),
      ];
    }
  }

  _buildActionItemsFromGrouping({
    actionItems,
    embeddings,
    groups,
    candidateActionItemIdsByIndex,
    existingActionItemIds,
  }: {
    actionItems: { description: string; owner: string }[];
    embeddings: number[][];
    groups: {
      matchActionItemId: string | null;
      title: string;
      description: string;
      owner: string | null;
      memberIndices: number[];
    }[];
    candidateActionItemIdsByIndex: string[][];
    existingActionItemIds: Set<string>;
  }): {
    matches: { memberIndex: number; actionItemId: string }[];
    newActionItemPayloads: {
      title: string;
      description: string;
      owner: string | null;
      embedding: number[];
      memberIndices: number[];
    }[];
  } {
    const placedIndices = new Set<number>();
    const matches: { memberIndex: number; actionItemId: string }[] = [];
    const newActionItemPayloads: {
      title: string;
      description: string;
      owner: string | null;
      embedding: number[];
      memberIndices: number[];
    }[] = [];

    for (const group of groups) {
      const memberIndices = [...new Set(group.memberIndices)].filter(
        (index) => index >= 0 && index < actionItems.length && !placedIndices.has(index),
      );

      if (memberIndices.length === 0) {
        continue;
      }

      if (memberIndices.length !== 1) {
        continue;
      }

      memberIndices.forEach((index) => placedIndices.add(index));
      const matchesEveryCandidateSet = Boolean(
        group.matchActionItemId &&
          memberIndices.every((index) => candidateActionItemIdsByIndex[index].includes(group.matchActionItemId!)),
      );

      if (group.matchActionItemId && existingActionItemIds.has(group.matchActionItemId) && matchesEveryCandidateSet) {
        memberIndices.forEach((memberIndex) => matches.push({ memberIndex, actionItemId: group.matchActionItemId! }));
        continue;
      }

      newActionItemPayloads.push({
        title: group.title,
        description: group.description,
        owner: group.owner,
        embedding: embeddings[memberIndices[0]],
        memberIndices,
      });
    }

    for (let index = 0; index < actionItems.length; index++) {
      if (placedIndices.has(index)) {
        continue;
      }

      newActionItemPayloads.push({
        title: actionItems[index].description,
        description: actionItems[index].description,
        owner: actionItems[index].owner,
        embedding: embeddings[index],
        memberIndices: [index],
      });
    }

    return { matches, newActionItemPayloads };
  }

  async _refreshCanonicalActionItemStaleness(projectId: string): Promise<void> {
    const referenced = await this.prisma.projectDocumentActionItem.findMany({
      where: { projectId, suppressed: false, projectActionItemId: { not: null } },
      distinct: ["projectActionItemId"],
      select: { projectActionItemId: true },
    });
    const referencedIds = referenced.flatMap((item) => (item.projectActionItemId ? [item.projectActionItemId] : []));

    await this.prisma.projectActionItem.updateMany({
      where: { projectId, ...(referencedIds.length > 0 ? { id: { in: referencedIds } } : { id: { in: [] } }) },
      data: { stale: false },
    });
    await this.prisma.projectActionItem.updateMany({
      where: { projectId, ...(referencedIds.length > 0 ? { id: { notIn: referencedIds } } : {}) },
      data: { stale: true },
    });
  }

  // retrieves a bounded candidate set; the LLM sees only these anchors, never the entire project's canonical list
  async _findNearestActionItemAnchors({
    projectId,
    embedding,
  }: {
    projectId: string;
    embedding: number[];
  }): Promise<{ id: string; distance: number }[]> {
    const rows = await this.prisma.$queryRaw<{ id: string; distance: number }[]>`
      SELECT id, ("summaryEmbedding" <=> ${`[${embedding.join(",")}]`}::halfvec) AS distance
      FROM "ProjectActionItem"
      WHERE "projectId" = ${projectId}::uuid
        AND stale = false
        AND "summaryEmbedding" IS NOT NULL
      ORDER BY distance ASC
      LIMIT ${ACTION_ITEM_CANDIDATE_LIMIT}
    `;

    return rows;
  }

  // cosine distance (0 identical, 1 orthogonal); native float math is correct for internal vector algebra
  _cosineDistance(first: number[], second: number[]): number {
    let dotProduct = 0;
    let firstMagnitude = 0;
    let secondMagnitude = 0;

    for (let index = 0; index < first.length; index++) {
      dotProduct += first[index] * second[index];
      firstMagnitude += first[index] * first[index];
      secondMagnitude += second[index] * second[index];
    }

    const magnitude = Math.sqrt(firstMagnitude) * Math.sqrt(secondMagnitude);

    return magnitude === 0 ? 1 : 1 - dotProduct / magnitude;
  }

  // restores the extraction-time decision/implementation status from the stored model output
  _localStatuses(statement: ProjectDocumentStatement): {
    decisionStatus: ProjectDocumentDecisionStatus | null;
    implementationStatus: ProjectDocumentImplementationStatus | null;
  } {
    if (!statement.aiAnalysisOutput) {
      return { decisionStatus: null, implementationStatus: null };
    }

    try {
      const parsed = JSON.parse(statement.aiAnalysisOutput) as {
        decisionStatus?: string | null;
        implementationStatus?: string | null;
      };

      const decisionStatuses = Object.values(ProjectDocumentDecisionStatus);
      const implementationStatuses = Object.values(ProjectDocumentImplementationStatus);

      return {
        decisionStatus:
          parsed.decisionStatus !== ProjectDocumentDecisionStatus.superseded &&
          decisionStatuses.includes(parsed.decisionStatus as ProjectDocumentDecisionStatus)
            ? (parsed.decisionStatus as ProjectDocumentDecisionStatus)
            : null,
        implementationStatus:
          parsed.implementationStatus !== ProjectDocumentImplementationStatus.reverted &&
          implementationStatuses.includes(parsed.implementationStatus as ProjectDocumentImplementationStatus)
            ? (parsed.implementationStatus as ProjectDocumentImplementationStatus)
            : null,
      };
    } catch (error) {
      this.logger.error(`Failed to parse statement aiAnalysisOutput for ${statement.id}`, error);
      return { decisionStatus: null, implementationStatus: null };
    }
  }

  // finds the prior statement a hint-carrying statement supersedes, via embedding candidates + an llm judgment
  async _findSupersededStatement({
    projectId,
    statement,
    embedding,
  }: {
    projectId: string;
    statement: ProjectDocumentStatement;
    embedding: number[];
  }): Promise<ProjectDocumentStatement | null> {
    if (!statement.replacesPriorStatementText) {
      return null;
    }

    // nearest earlier statements in the same project, ranked by the prior-decision hint
    const candidates = await this.prisma.$queryRaw<{ id: string; textDerived: string }[]>`
      SELECT id, "textDerived"
      FROM "ProjectDocumentStatement"
      WHERE "projectId" = ${projectId}::uuid
        AND "occurredAt" < ${statement.occurredAt}
        AND id != ${statement.id}::uuid
        AND "textDerivedEmbedding" IS NOT NULL
        AND "suppressed" = false
      ORDER BY "textDerivedEmbedding" <=> ${`[${embedding.join(",")}]`}::halfvec
      LIMIT ${SUPERSESSION_CANDIDATE_LIMIT}
    `;

    if (candidates.length === 0) {
      return null;
    }

    const judgment = await this.openaiService.generateStatementSupersessionJudgment({
      statement: statement.textDerived,
      candidates: candidates.map((candidate) => ({ id: candidate.id, text: candidate.textDerived })),
      candidateRole: "prior",
      hint: statement.replacesPriorStatementText,
    });

    return judgment.candidateId && judgment.confidence >= SUPERSESSION_CONFIDENCE_THRESHOLD
      ? this.prisma.projectDocumentStatement.findUnique({ where: { id: judgment.candidateId } })
      : null;
  }

  // finds a LATER statement that reverses a still-live proposal/decision, without an extraction hint (cross-document)
  async _findOverturningStatement({
    projectId,
    statement,
  }: {
    projectId: string;
    statement: ProjectDocumentStatement;
  }): Promise<ProjectDocumentStatement | null> {
    // without a date we cannot order candidates temporally, so there is nothing to look forward to
    if (!statement.occurredAt) {
      return null;
    }

    // Reuse the source statement's stored embedding instead of calling the embedding API again.
    const candidates = await this.prisma.$queryRaw<
      {
        id: string;
        textDerived: string;
        type: ProjectDocumentStatementType;
        decisionStatus: ProjectDocumentDecisionStatus | null;
      }[]
    >`
      SELECT candidate.id, candidate."textDerived", candidate.type, candidate."decisionStatus"
      FROM "ProjectDocumentStatement" candidate
      JOIN "ProjectDocumentStatement" source ON source.id = ${statement.id}::uuid
      WHERE candidate."projectId" = ${projectId}::uuid
        AND candidate."occurredAt" > ${statement.occurredAt}
        AND candidate.id != ${statement.id}::uuid
        AND candidate."textDerivedEmbedding" IS NOT NULL
        AND source."textDerivedEmbedding" IS NOT NULL
        AND candidate."suppressed" = false
      ORDER BY candidate."textDerivedEmbedding" <=> source."textDerivedEmbedding"
      LIMIT ${SUPERSESSION_CANDIDATE_LIMIT}
    `;

    const committedCandidates = candidates.filter((later) => {
      // a committed reversal is a decision or an accepted proposal; an open proposal or question does not overturn a
      // prior choice (F16: a broad "focus on look and feel" open proposal was superseding six specific proposals)
      return (
        later.type === ProjectDocumentStatementType.decision ||
        later.decisionStatus === ProjectDocumentDecisionStatus.accepted
      );
    });

    if (committedCandidates.length === 0) {
      return null;
    }

    const judgment = await this.openaiService.generateStatementSupersessionJudgment({
      statement: statement.textDerived,
      candidates: committedCandidates.map((candidate) => ({ id: candidate.id, text: candidate.textDerived })),
      candidateRole: "new",
    });

    if (!judgment.candidateId || judgment.confidence < SUPERSESSION_CONFIDENCE_THRESHOLD) {
      return null;
    }

    return this.prisma.projectDocumentStatement.findUnique({ where: { id: judgment.candidateId } });
  }

  /**
   * Resolves each reference to the document or statement it points to, materializing the link.
   * Recomputed every run: a reference is embedded, its nearest documents/statements are judged against its expectation,
   * and it is set linked/contradicted (with a target) or left notFound.
   * @param projectId - the project whose references to resolve
   */
  async _resolveReferences(projectId: string): Promise<{ referencesResolved: number }> {
    // skip human-set resolutions (pinned) and human-invalidated references
    const references = await this.prisma.projectDocumentReference.findMany({
      where: { projectId, origin: { not: ProjectDataOrigin.human }, suppressed: false },
      select: { id: true, fromProjectDocumentId: true, referentText: true, expectation: true },
    });

    if (references.length === 0) {
      return { referencesResolved: 0 };
    }

    this.logger.log(`Resolving ${references.length} references`);

    let referencesResolved = 0;
    const concurrency = this.openaiService.configService.get<number>("RECONCILE_CONCURRENCY", 1);
    const { embeddings } = await this.openaiService.generateEmbeddings(
      references.map((reference) => reference.referentText),
    );
    const results = await this._mapWithConcurrency(references, concurrency, (reference, index) =>
      this._resolveReference({ projectId, reference, embedding: embeddings[index] }),
    );

    for (let index = 0; index < references.length; index++) {
      const reference = references[index];
      const result = results[index];

      await this.prisma.projectDocumentReference.update({
        where: { id: reference.id },
        data: {
          resolution: result.resolution,
          resolvedToDocumentId: result.resolvedToDocumentId,
          resolvedToStatementId: result.resolvedToStatementId,
        },
      });

      if (result.resolution !== ProjectDocumentReferenceResolution.notFound) {
        referencesResolved++;
      }
    }

    return { referencesResolved };
  }

  // resolves one reference: nearest documents first, then nearest statements, taking the first confident judgment
  async _resolveReference({
    projectId,
    reference,
    embedding,
  }: {
    projectId: string;
    reference: { id: string; fromProjectDocumentId: string; referentText: string; expectation: string };
    embedding: number[];
  }): Promise<{
    resolution: ProjectDocumentReferenceResolution;
    resolvedToDocumentId: string | null;
    resolvedToStatementId: string | null;
  }> {
    const documentCandidates = await this.prisma.$queryRaw<{ id: string; summary: string | null }[]>`
      SELECT id, summary
      FROM "ProjectDocument"
      WHERE "projectId" = ${projectId}::uuid
        AND id != ${reference.fromProjectDocumentId}::uuid
        AND "summaryEmbedding" IS NOT NULL
      ORDER BY "summaryEmbedding" <=> ${`[${embedding.join(",")}]`}::halfvec
      LIMIT ${RESOLUTION_CANDIDATE_LIMIT}
    `;

    const statementCandidates = await this.prisma.$queryRaw<{ id: string; textDerived: string }[]>`
      SELECT id, "textDerived"
      FROM "ProjectDocumentStatement"
      WHERE "projectId" = ${projectId}::uuid
        AND "projectDocumentId" != ${reference.fromProjectDocumentId}::uuid
        AND "textDerivedEmbedding" IS NOT NULL
        AND "suppressed" = false
      ORDER BY "textDerivedEmbedding" <=> ${`[${embedding.join(",")}]`}::halfvec
      LIMIT ${RESOLUTION_CANDIDATE_LIMIT}
    `;

    const candidates = [
      ...documentCandidates
        .filter((candidate): candidate is { id: string; summary: string } => Boolean(candidate.summary))
        .map((candidate) => ({ id: candidate.id, text: candidate.summary, kind: "document" as const })),
      ...statementCandidates.map((candidate) => ({
        id: candidate.id,
        text: candidate.textDerived,
        kind: "statement" as const,
      })),
    ];

    if (candidates.length > 0) {
      const judgment = await this.openaiService.generateReferenceResolutionJudgment({
        referentText: reference.referentText,
        expectation: reference.expectation,
        candidates,
      });

      if (judgment.candidateId && judgment.confidence >= RESOLUTION_CONFIDENCE_THRESHOLD) {
        return {
          resolution: this._toReferenceResolution(judgment.resolution),
          resolvedToDocumentId: judgment.candidateKind === "document" ? judgment.candidateId : null,
          resolvedToStatementId: judgment.candidateKind === "statement" ? judgment.candidateId : null,
        };
      }
    }

    return {
      resolution: ProjectDocumentReferenceResolution.notFound,
      resolvedToDocumentId: null,
      resolvedToStatementId: null,
    };
  }

  _toReferenceResolution(resolution: "linked" | "contradicted"): ProjectDocumentReferenceResolution {
    return resolution === "linked"
      ? ProjectDocumentReferenceResolution.linked
      : ProjectDocumentReferenceResolution.contradicted;
  }

  /**
   * Sets each canonical action item's status from the best available signal, to the system's full capability.
   * For every non-human-pinned item: start from the aggregate of its members' extraction-time status, then override with
   * a decisive later-document signal, else a code-index implementation signal. Recomputed every run, so it stays current
   * as new documents and commits arrive. Never lapses an item from silence - only a decisive judgment can.
   * @param projectId - the project whose action-item status to resolve
   */
  async _resolveCanonicalActionItemStatus(projectId: string): Promise<{ actionItemsResolved: number }> {
    const items = await this.prisma.projectActionItem.findMany({
      where: { projectId, stale: false, statusSource: { not: ProjectActionItemStatusSource.manual } },
      select: {
        id: true,
        title: true,
        description: true,
        documentActionItems: {
          select: { status: true, projectDocument: { select: { id: true, occurredAt: true } } },
        },
      },
    });

    if (items.length === 0) {
      return { actionItemsResolved: 0 };
    }

    this.logger.log(`Resolving status for ${items.length} canonical action items`);

    const repositoryFileCount = await this.prisma.repositoryFile.count({ where: { projectId } });
    const allowedStatuses = Object.values(ProjectDocumentActionItemStatus);
    const resolvableItems = items.filter((item) => item.documentActionItems.length > 0);
    const actionItemTexts = resolvableItems.map((item) => `${item.title}\n${item.description}`);
    const { embeddings } = await this.openaiService.generateEmbeddings(actionItemTexts);
    const evidenceByItem = await this._mapWithConcurrency(resolvableItems, 4, (item, itemIndex) => {
      const itemTime = item.documentActionItems
        .map((member) => member.projectDocument.occurredAt)
        .reduce((latest, current) => (current > latest ? current : latest));

      return this._findActionItemResolutionEvidence({
        projectId,
        itemTime,
        embedding: embeddings[itemIndex],
        includeCodeCandidates: repositoryFileCount > 0,
      });
    });
    const judgments = new Array<{
      candidateId: string | null;
      candidateKind: "document" | "code" | null;
      status: string;
      confidence: number;
    }>(resolvableItems.length);

    for (let offset = 0; offset < resolvableItems.length; offset += ACTION_ITEM_RESOLUTION_BATCH_SIZE) {
      const batchItems = resolvableItems.slice(offset, offset + ACTION_ITEM_RESOLUTION_BATCH_SIZE);
      const batchEvidence = evidenceByItem.slice(offset, offset + ACTION_ITEM_RESOLUTION_BATCH_SIZE);
      const { decisions } = await this.openaiService.generateActionItemResolutionJudgments({
        actionItems: batchItems.map((item, index) => ({
          actionItem: actionItemTexts[offset + index],
          candidates: batchEvidence[index].candidates,
        })),
        statuses: allowedStatuses,
      });

      decisions.forEach((decision, index) => {
        judgments[offset + index] = decision;
      });
    }

    let actionItemsResolved = 0;

    for (let itemIndex = 0; itemIndex < resolvableItems.length; itemIndex++) {
      const item = resolvableItems[itemIndex];
      const memberStatuses = item.documentActionItems.map((member) => member.status);
      let finalStatus: ProjectDocumentActionItemStatus = this._aggregateMemberStatus(memberStatuses);
      let statusSource: ProjectActionItemStatusSource = ProjectActionItemStatusSource.extracted;
      let resolvedByDocumentId: string | null = null;
      let resolvedByRepositoryFileId: string | null = null;
      const judgment = judgments[itemIndex];
      const evidence = evidenceByItem[itemIndex];

      if (
        judgment?.candidateId &&
        judgment.confidence >= RESOLUTION_CONFIDENCE_THRESHOLD &&
        (allowedStatuses as string[]).includes(judgment.status)
      ) {
        if (judgment.candidateKind === "document") {
          const documentId = evidence.documentIdByCandidateId.get(judgment.candidateId);
          if (documentId) {
            finalStatus = judgment.status as ProjectDocumentActionItemStatus;
            statusSource = ProjectActionItemStatusSource.document;
            resolvedByDocumentId = documentId;
          }
        } else if (judgment.candidateKind === "code" && judgment.status === ProjectDocumentActionItemStatus.done) {
          finalStatus = ProjectDocumentActionItemStatus.done;
          statusSource = ProjectActionItemStatusSource.code;
          resolvedByRepositoryFileId = judgment.candidateId;
        }
      }

      await this.prisma.projectActionItem.update({
        where: { id: item.id },
        data: {
          status: finalStatus,
          statusSource,
          resolvedByDocumentId,
          resolvedByRepositoryFileId,
          resolvedBySymbolId: null,
          resolvedAt: statusSource === ProjectActionItemStatusSource.extracted ? null : new Date(),
        },
      });

      if (statusSource !== ProjectActionItemStatusSource.extracted) {
        actionItemsResolved++;
      }
    }

    return { actionItemsResolved };
  }

  async _findActionItemResolutionEvidence({
    projectId,
    itemTime,
    embedding,
    includeCodeCandidates,
  }: {
    projectId: string;
    itemTime: Date;
    embedding: number[];
    includeCodeCandidates: boolean;
  }): Promise<ActionItemResolutionEvidence> {
    const laterStatements = await this.prisma.$queryRaw<
      { id: string; textDerived: string; projectDocumentId: string }[]
    >`
      SELECT s.id, s."textDerived", s."projectDocumentId"
      FROM "ProjectDocumentStatement" s
      JOIN "ProjectDocument" d ON d.id = s."projectDocumentId"
      WHERE s."projectId" = ${projectId}::uuid
        AND s."textDerivedEmbedding" IS NOT NULL
        AND s."suppressed" = false
        AND d."occurredAt" > ${itemTime}
      ORDER BY s."textDerivedEmbedding" <=> ${`[${embedding.join(",")}]`}::halfvec
      LIMIT ${RESOLUTION_CANDIDATE_LIMIT}
    `;
    const fileCandidates = includeCodeCandidates
      ? await this.prisma.$queryRaw<{ id: string; summary: string | null }[]>`
          SELECT id, summary
          FROM "RepositoryFile"
          WHERE "projectId" = ${projectId}::uuid
            AND "summaryEmbedding" IS NOT NULL
          ORDER BY "summaryEmbedding" <=> ${`[${embedding.join(",")}]`}::halfvec
          LIMIT ${RESOLUTION_CANDIDATE_LIMIT}
        `
      : [];

    return {
      candidates: [
        ...laterStatements.map((candidate) => ({ id: candidate.id, text: candidate.textDerived, kind: "document" as const })),
        ...fileCandidates
          .filter((candidate): candidate is { id: string; summary: string } => Boolean(candidate.summary))
          .map((candidate) => ({ id: candidate.id, text: candidate.summary, kind: "code" as const })),
      ],
      documentIdByCandidateId: new Map(laterStatements.map((candidate) => [candidate.id, candidate.projectDocumentId])),
    };
  }

  // aggregates a canonical item's member (extraction-time) statuses into a base, most-advanced-wins (lapsed is relational)
  _aggregateMemberStatus(statuses: ProjectDocumentActionItemStatus[]): ProjectDocumentActionItemStatus {
    const precedence: ProjectDocumentActionItemStatus[] = [
      ProjectDocumentActionItemStatus.done,
      ProjectDocumentActionItemStatus.inProgress,
      ProjectDocumentActionItemStatus.blocked,
      ProjectDocumentActionItemStatus.open,
    ];

    for (const status of precedence) {
      if (statuses.includes(status)) {
        return status;
      }
    }

    return ProjectDocumentActionItemStatus.open;
  }
}
