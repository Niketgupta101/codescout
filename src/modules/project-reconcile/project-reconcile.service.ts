import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import {
  Prisma,
  ProjectActionItemStatusSource,
  ProjectDataOrigin,
  ProjectDocumentActionItemStatus,
  ProjectDocumentDecisionStatus,
  ProjectDocumentImplementationStatus,
  ProjectDocumentReferenceResolution,
  ProjectDocumentStatementType,
  ProjectDocumentType,
  ProjectTopicType,
} from "@prisma/client";
import type { ProjectDocumentStatement, ProjectTopic } from "@prisma/client";
import { encode } from "gpt-tokenizer/cjs/encoding/o200k_base";
import { PrismaService } from "../../prisma/prisma.service";
import { OpenAIService } from "../openai/openai.service";
import { ProjectCorrectionService } from "../project-correction/project-correction.service";
import type { ProjectReconcileResult } from "./types/project-reconcile-result.type";
import type { ProjectReconcileStatementState } from "./types/project-reconcile-statement-state.type";
import type { ActionItemResolutionDecision } from "../openai/types/action-item-resolution-decision.type";
import type { ActionItemResolutionEvidence } from "./types/action-item-resolution-evidence.type";
import type { ProjectActionItemResolveResult } from "./types/project-action-item-resolve-result.type";
import type { ProjectActionItemResolveProposal } from "./types/project-action-item-resolve-proposal.type";
import {
  RESOLUTION_JUDGMENT_VERSION,
  actionItemResolutionDigest,
} from "./utils/action-item-resolution-digest.util";
import { aggregateMemberStatus } from "./utils/aggregate-member-status.util";

// raised from 0.6 after a seed inspection showed the judge over-linking relatedness/strategy as supersession (F16)
const SUPERSESSION_CONFIDENCE_THRESHOLD = 0.75;
const SUPERSESSION_CANDIDATE_LIMIT = 5;
const SUPERSESSION_DISTANCE_THRESHOLD = 0.35;
const SUPERSESSION_BATCH_SIZE = 10;

type CandidateSupersessionEdge = {
  sourceId: string;
  targetId: string;
  confidence: number;
  distance: number;
  weight: number;
};

// resolution (references + action-item status) mirrors the supersession pattern: nearest candidates then an llm judgment
const RESOLUTION_CONFIDENCE_THRESHOLD = 0.6;
const RESOLUTION_CANDIDATE_LIMIT = 5;
// measured over this corpus: 0.45 would have starved 41% of items of any evidence at all, 0.65 starves none.
// it only trims the tail - the candidate limit does the real selecting
const RESOLUTION_DOCUMENT_DISTANCE_THRESHOLD = 0.65;
// genres that state intent rather than record events. a spec saying "there are two views" describes what the
// system should be, and reading it as proof the work happened is the same mistake as judging code from its summary
const RESOLUTION_EXCLUDED_EVIDENCE_TYPES: ProjectDocumentType[] = [
  ProjectDocumentType.conceptPaper,
  ProjectDocumentType.scopeDocument,
  ProjectDocumentType.userStory,
  ProjectDocumentType.implementationPlan,
];

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
// candidate text dominates a resolution prompt, so batches stay small enough to keep each judgment sharp
const ACTION_ITEM_RESOLUTION_BATCH_SIZE = 5;
const ACTION_ITEM_RESOLUTION_BATCH_TOKENS = 8000;
const RESOLUTION_WRITE_CHUNK_SIZE = 200;

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

  /**
   * Resolves canonical action-item statuses from decisive later-document evidence.
   * @param projectId - the project whose action items to resolve
   * @param options - force re-judges items whose evidence is unchanged; dryRun returns the proposals without writing
   */
  async resolveActionItemStatuses(
    projectId: string,
    options: { force?: boolean; dryRun?: boolean } = {},
  ): Promise<ProjectActionItemResolveResult> {
    this.logger.log(`Resolving canonical action-item statuses for project ${projectId}`);

    return this._resolveCanonicalActionItemStatus(projectId, options);
  }

  async threadStatements(projectId: string): Promise<{ statementsReconciled: number; supersessionsLinked: number }> {
    this.logger.log(`Threading statements for project ${projectId}`);

    return this._threadStatements(projectId);
  }

  async reconcile(projectId: string): Promise<ProjectReconcileResult> {
    const startedAt = Date.now();
    this.logger.log(`Reconciling project ${projectId}`);

    const { correctionsApplied, topicsCreated, topicsMatched, actionItemsCreated, actionItemsMatched } =
      await this.canonicalize(projectId);

    const { statementsReconciled, supersessionsLinked } = await this._threadStatements(projectId);

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
      statementsReconciled,
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
      await this._refreshCanonicalActionItemStatus(projectId);
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
        batch.map((item) => `${item.owner ?? ""}\n${item.description}`),
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
    await this._refreshCanonicalActionItemStatus(projectId);
    this.logger.log(
      `Folded ${actionItemsLinked} doc-level action items into ${matchedCanonicalIds.size} existing canonical items, created ${actionItemsCreated} new`,
    );

    return { actionItemsCreated, actionItemsMatched: matchedCanonicalIds.size };
  }

  _buildBoundedActionItemBatches<
    T extends { description: string; owner: string | null; projectDocumentId?: string },
  >(items: T[]): T[][] {
    const batches: T[][] = [];
    let current: T[] = [];
    let currentTokens = 0;

    for (const item of items) {
      const itemTokens = encode(`${item.owner ?? ""}\n${item.description}`).length;
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
    batch: { description: string; owner: string | null; status: ProjectDocumentActionItemStatus }[];
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
    actionItems: { description: string; owner: string | null }[];
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

  // canonicalization creates items at the default open, so without this a freshly folded item ignores what its own
  // members observed until a resolution run happens to touch it. resolved and human-pinned items keep their status
  async _refreshCanonicalActionItemStatus(projectId: string): Promise<void> {
    const items = await this.prisma.projectActionItem.findMany({
      where: {
        projectId,
        origin: { not: ProjectDataOrigin.human },
        statusSource: ProjectActionItemStatusSource.extracted,
      },
      select: {
        id: true,
        status: true,
        documentActionItems: {
          where: { suppressed: false },
          select: { status: true, projectDocument: { select: { occurredAt: true } } },
        },
      },
    });

    const updates = items.flatMap((item) => {
      if (item.documentActionItems.length === 0) {
        return [];
      }

      const aggregate = aggregateMemberStatus(item.documentActionItems);

      return aggregate === item.status
        ? []
        : [this.prisma.projectActionItem.update({ where: { id: item.id }, data: { status: aggregate } })];
    });

    for (let offset = 0; offset < updates.length; offset += RESOLUTION_WRITE_CHUNK_SIZE) {
      await this.prisma.$transaction(updates.slice(offset, offset + RESOLUTION_WRITE_CHUNK_SIZE));
    }

    if (updates.length > 0) {
      this.logger.log(`Refreshed extracted status on ${updates.length} canonical action item(s)`);
    }
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

  _resolveSupersessionGraph(edges: CandidateSupersessionEdge[]): { sourceId: string; targetId: string }[] {
    const validEdges = edges
      .filter((edge) => edge.confidence >= SUPERSESSION_CONFIDENCE_THRESHOLD)
      .sort((a, b) => b.weight - a.weight);

    const usedSources = new Set<string>();
    const usedTargets = new Set<string>();
    const selectedEdges: { sourceId: string; targetId: string }[] = [];
    const forwardMap = new Map<string, string>();

    for (const edge of validEdges) {
      if (usedSources.has(edge.sourceId) || usedTargets.has(edge.targetId)) {
        continue;
      }

      // cycle check: trace forward from edge.targetId to ensure we never reach edge.sourceId
      let current: string | undefined = edge.targetId;
      let hasCycle = false;
      while (current) {
        if (current === edge.sourceId) {
          hasCycle = true;
          break;
        }
        current = forwardMap.get(current);
      }

      if (hasCycle) {
        continue;
      }

      usedSources.add(edge.sourceId);
      usedTargets.add(edge.targetId);
      forwardMap.set(edge.sourceId, edge.targetId);
      selectedEdges.push({ sourceId: edge.sourceId, targetId: edge.targetId });
    }

    return selectedEdges;
  }

  async _threadStatements(
    projectId: string,
  ): Promise<{ statementsReconciled: number; supersessionsLinked: number }> {
    const startedAt = Date.now();
    const statements = await this.prisma.projectDocumentStatement.findMany({
      where: { projectId, suppressed: false },
      orderBy: { occurredAt: "asc" },
    });

    if (statements.length === 0) {
      return { statementsReconciled: 0, supersessionsLinked: 0 };
    }

    this.logger.log(`Threading ${statements.length} statements for project ${projectId}`);

    const statementById = new Map<string, ProjectDocumentStatement>();
    const desiredStates = new Map<string, ProjectReconcileStatementState>();

    for (const statement of statements) {
      statementById.set(statement.id, statement);
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

    const candidateEdges: CandidateSupersessionEdge[] = [];

    // PASS 1: Hint-carrying statements
    const hintStatements = statements.filter(
      (statement) => Boolean(statement.replacesPriorStatementText) && Boolean(statement.occurredAt),
    );

    if (hintStatements.length > 0) {
      const { embeddings: hintEmbeddings } = await this.openaiService.generateEmbeddings(
        hintStatements.map((statement) => statement.replacesPriorStatementText!),
      );

      const hintItemsForLlm: {
        statement: ProjectDocumentStatement;
        candidates: { id: string; text: string; distance: number }[];
      }[] = [];

      for (let index = 0; index < hintStatements.length; index++) {
        const statement = hintStatements[index];
        const embedding = hintEmbeddings[index];

        const rows = await this.prisma.$queryRaw<{ id: string; textDerived: string; distance: number }[]>`
          SELECT id, "textDerived", ("textDerivedEmbedding" <=> ${`[${embedding.join(",")}]`}::halfvec) AS distance
          FROM "ProjectDocumentStatement"
          WHERE "projectId" = ${projectId}::uuid
            AND "occurredAt" < ${statement.occurredAt}
            AND id != ${statement.id}::uuid
            AND "textDerivedEmbedding" IS NOT NULL
            AND "suppressed" = false
            AND ("textDerivedEmbedding" <=> ${`[${embedding.join(",")}]`}::halfvec) <= ${SUPERSESSION_DISTANCE_THRESHOLD}
          ORDER BY distance ASC
          LIMIT ${SUPERSESSION_CANDIDATE_LIMIT}
        `;

        if (rows.length > 0) {
          hintItemsForLlm.push({
            statement,
            candidates: rows.map((row) => ({ id: row.id, text: row.textDerived, distance: row.distance })),
          });
        }
      }

      for (let index = 0; index < hintItemsForLlm.length; index += SUPERSESSION_BATCH_SIZE) {
        const batch = hintItemsForLlm.slice(index, index + SUPERSESSION_BATCH_SIZE);
        const { decisions } = await this.openaiService.generateStatementBatchSupersessionJudgments({
          items: batch.map((item) => ({
            statement: item.statement.textDerived,
            candidateRole: "prior",
            hint: item.statement.replacesPriorStatementText,
            candidates: item.candidates.map((candidate) => ({ id: candidate.id, text: candidate.text })),
          })),
        });

        for (let batchIndex = 0; batchIndex < batch.length; batchIndex++) {
          const decision = decisions[batchIndex];
          if (decision?.candidateId && decision.confidence >= SUPERSESSION_CONFIDENCE_THRESHOLD) {
            const matchedCandidate = batch[batchIndex].candidates.find((candidate) => candidate.id === decision.candidateId);
            const distance = matchedCandidate ? matchedCandidate.distance : 0;
            candidateEdges.push({
              sourceId: decision.candidateId,
              targetId: batch[batchIndex].statement.id,
              confidence: decision.confidence,
              distance,
              weight: decision.confidence * (1 - distance),
            });
          }
        }
      }
    }

    // PASS 2: Cross-document live proposals/decisions
    const liveProposalsAndDecisions = statements.filter((statement) => {
      const isProposalOrDecision =
        statement.type === ProjectDocumentStatementType.proposal ||
        statement.type === ProjectDocumentStatementType.decision;
      return isProposalOrDecision && Boolean(statement.occurredAt);
    });

    if (liveProposalsAndDecisions.length > 0) {
      const crossDocItemsForLlm: {
        statement: ProjectDocumentStatement;
        candidates: { id: string; text: string; distance: number }[];
      }[] = [];

      for (const statement of liveProposalsAndDecisions) {
        const rows = await this.prisma.$queryRaw<
          {
            id: string;
            textDerived: string;
            type: ProjectDocumentStatementType;
            decisionStatus: ProjectDocumentDecisionStatus | null;
            distance: number;
          }[]
        >`
          SELECT candidate.id, candidate."textDerived", candidate.type, candidate."decisionStatus",
                 (candidate."textDerivedEmbedding" <=> source."textDerivedEmbedding") AS distance
          FROM "ProjectDocumentStatement" candidate
          JOIN "ProjectDocumentStatement" source ON source.id = ${statement.id}::uuid
          WHERE candidate."projectId" = ${projectId}::uuid
            AND candidate."occurredAt" > ${statement.occurredAt}
            AND candidate.id != ${statement.id}::uuid
            AND candidate."textDerivedEmbedding" IS NOT NULL
            AND source."textDerivedEmbedding" IS NOT NULL
            AND candidate."suppressed" = false
            AND (
              candidate.type = 'decision'::"ProjectDocumentStatementType" OR
              candidate.type = 'proposal'::"ProjectDocumentStatementType" OR
              candidate."decisionStatus" = 'accepted'::"ProjectDocumentDecisionStatus"
            )
            AND (candidate."textDerivedEmbedding" <=> source."textDerivedEmbedding") <= ${SUPERSESSION_DISTANCE_THRESHOLD}
          ORDER BY distance ASC
          LIMIT ${SUPERSESSION_CANDIDATE_LIMIT}
        `;

        if (rows.length > 0) {
          crossDocItemsForLlm.push({
            statement,
            candidates: rows.map((row) => ({ id: row.id, text: row.textDerived, distance: row.distance })),
          });
        }
      }

      for (let index = 0; index < crossDocItemsForLlm.length; index += SUPERSESSION_BATCH_SIZE) {
        const batch = crossDocItemsForLlm.slice(index, index + SUPERSESSION_BATCH_SIZE);
        const { decisions } = await this.openaiService.generateStatementBatchSupersessionJudgments({
          items: batch.map((item) => ({
            statement: item.statement.textDerived,
            candidateRole: "new",
            candidates: item.candidates.map((candidate) => ({ id: candidate.id, text: candidate.text })),
          })),
        });

        for (let batchIndex = 0; batchIndex < batch.length; batchIndex++) {
          const decision = decisions[batchIndex];
          if (decision?.candidateId && decision.confidence >= SUPERSESSION_CONFIDENCE_THRESHOLD) {
            const matchedCandidate = batch[batchIndex].candidates.find((candidate) => candidate.id === decision.candidateId);
            const distance = matchedCandidate ? matchedCandidate.distance : 0;
            candidateEdges.push({
              sourceId: batch[batchIndex].statement.id,
              targetId: decision.candidateId,
              confidence: decision.confidence,
              distance,
              weight: decision.confidence * (1 - distance),
            });
          }
        }
      }
    }

    // RESOLVE GRAPH EDGES WITH GREEDY MAXIMUM WEIGHT MATCHING
    const resolvedEdges = this._resolveSupersessionGraph(candidateEdges);
    let supersessionsLinked = 0;

    for (const { sourceId, targetId } of resolvedEdges) {
      const sourceState = desiredStates.get(sourceId);
      const targetState = desiredStates.get(targetId);
      const targetStatement = statementById.get(targetId);

      if (!sourceState || !targetState || !targetStatement) {
        continue;
      }

      sourceState.replacedByStatementId = targetId;
      sourceState.decisionStatus = ProjectDocumentDecisionStatus.superseded;
      sourceState.validUntil = targetStatement.occurredAt;
      targetState.replacesPriorStatementId = sourceId;
      supersessionsLinked++;
    }

    // ATOMIC PERSISTENCE
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

    this.logger.log(
      `Threading complete for project ${projectId} in ${Date.now() - startedAt}ms: ${statements.length} statements processed, ${supersessionsLinked} supersessions linked across ${candidateEdges.length} candidate edges`,
    );

    return {
      statementsReconciled: statements.length,
      supersessionsLinked,
    };
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
  async _resolveCanonicalActionItemStatus(
    projectId: string,
    options: { force?: boolean; dryRun?: boolean } = {},
  ): Promise<ProjectActionItemResolveResult> {
    const items = await this.prisma.projectActionItem.findMany({
      where: {
        projectId,
        stale: false,
        statusSource: { not: ProjectActionItemStatusSource.manual },
        origin: { not: ProjectDataOrigin.human },
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        statusSource: true,
        resolutionEvidenceDigest: true,
        // a suppressed member is a human saying "this extraction was wrong", so it must not feed the
        // aggregate or push itemTime forward
        documentActionItems: {
          where: { suppressed: false },
          select: { id: true, status: true, projectDocument: { select: { id: true, occurredAt: true } } },
        },
      },
    });
    const resolvableItems = items.filter((item) => item.documentActionItems.length > 0);
    const empty: ProjectActionItemResolveResult = {
      actionItemsExamined: items.length,
      actionItemsJudged: 0,
      actionItemsSkipped: 0,
      actionItemsResolved: 0,
      actionItemsReverted: 0,
      actionItemsConflicted: 0,
      quoteRejections: 0,
      proposals: [],
    };

    if (resolvableItems.length === 0) {
      return empty;
    }

    this.logger.log(
      `Resolving status for ${resolvableItems.length} canonical action items${options.dryRun ? " (dry run)" : ""}`,
    );

    const actionItemTexts = resolvableItems.map((item) => `${item.title}\n${item.description}`);
    const { embeddings } = await this.openaiService.generateEmbeddings(actionItemTexts);
    const itemTimes = resolvableItems.map((item) =>
      item.documentActionItems
        .map((member) => member.projectDocument.occurredAt)
        .reduce((latest, current) => (current > latest ? current : latest)),
    );
    const evidenceByItem = await this._mapWithConcurrency(
      resolvableItems,
      this.openaiService.inferenceConcurrency,
      (item, itemIndex) =>
        this._findActionItemResolutionEvidence({
          projectId,
          itemTime: itemTimes[itemIndex],
          embedding: embeddings[itemIndex],
        }),
    );
    const digests = resolvableItems.map((item, itemIndex) =>
      actionItemResolutionDigest({
        title: item.title,
        description: item.description,
        itemTime: itemTimes[itemIndex],
        memberIds: item.documentActionItems.map((member) => member.id),
        candidateEntries: evidenceByItem[itemIndex].digestEntries,
      }),
    );

    // the digest gates the llm call only. an item whose evidence is unchanged keeps its previous verdict and is
    // not written at all, which is what makes a repeat run cost nothing and preserves its provenance
    const judgeableIndices = resolvableItems
      .map((_, itemIndex) => itemIndex)
      .filter(
        (itemIndex) =>
          options.force === true || digests[itemIndex] !== resolvableItems[itemIndex].resolutionEvidenceDigest,
      )
      .filter((itemIndex) => evidenceByItem[itemIndex].candidates.length > 0);
    const skippedByDigest = resolvableItems.length - judgeableIndices.length;

    this.logger.log(
      `${judgeableIndices.length} item(s) need judging, ${skippedByDigest} skipped on an unchanged evidence set`,
    );

    const decisionsByItem = new Map<number, ActionItemResolutionDecision[]>();
    const batches = this._buildBoundedActionItemResolutionBatches(judgeableIndices, actionItemTexts, evidenceByItem);
    const batchResults = await this._mapWithConcurrency(
      batches,
      this.openaiService.inferenceConcurrency,
      async (batchIndices) => {
        const result = await this.openaiService.generateActionItemResolutionJudgments({
          actionItems: batchIndices.map((itemIndex) => ({
            actionItem: actionItemTexts[itemIndex],
            candidates: evidenceByItem[itemIndex].candidates,
          })),
        });

        // carried as explicit pairs: positional slicing across concurrent batches is where one item's evidence
        // silently becomes another's
        return {
          quoteRejections: result.quoteRejections,
          pairs: batchIndices.map((itemIndex, positionInBatch) => ({
            itemIndex,
            decisions: result.decisionsByItem[positionInBatch] ?? [],
          })),
        };
      },
    );

    let quoteRejections = 0;

    for (const batchResult of batchResults) {
      quoteRejections += batchResult.quoteRejections;

      for (const pair of batchResult.pairs) {
        decisionsByItem.set(pair.itemIndex, pair.decisions);
      }
    }

    const proposals: ProjectActionItemResolveProposal[] = [];
    const updates: Prisma.PrismaPromise<unknown>[] = [];
    let actionItemsResolved = 0;
    let actionItemsReverted = 0;
    let actionItemsConflicted = 0;

    for (const itemIndex of judgeableIndices) {
      const item = resolvableItems[itemIndex];
      const evidence = evidenceByItem[itemIndex];
      const confident = (decisionsByItem.get(itemIndex) ?? []).filter(
        (decision) => decision.confidence >= RESOLUTION_CONFIDENCE_THRESHOLD,
      );
      const supporting = confident.filter((decision) => decision.verdict === "supports");
      const contradicting = confident.filter((decision) => decision.verdict === "contradicts");

      let finalStatus: ProjectDocumentActionItemStatus = aggregateMemberStatus(item.documentActionItems);
      let statusSource: ProjectActionItemStatusSource = ProjectActionItemStatusSource.extracted;
      let resolvedByDocumentId: string | null = null;
      let reason: string | null = null;
      let resolutionEvidence: Prisma.InputJsonValue | null = null;

      // models over-answer heavily when evidence conflicts, so refusing is a branch rather than a prompt rule:
      // one candidate saying it shipped and another saying it is still open is not a resolution
      if (supporting.length > 0 && contradicting.length > 0) {
        actionItemsConflicted++;
        this.logger.warn(
          `Abstaining on action item ${item.id} (${item.title}): ${supporting.length} supporting and ${contradicting.length} contradicting candidate(s)`,
        );
      } else if (supporting.length > 0) {
        const [best] = [...supporting].sort((first, second) => second.confidence - first.confidence);
        const documentId = evidence.documentIdByCandidateId.get(best.candidateId);

        if (documentId) {
          // auto-resolution may only ever conclude done; every other status stays with the extraction aggregate
          finalStatus = ProjectDocumentActionItemStatus.done;
          statusSource = ProjectActionItemStatusSource.document;
          resolvedByDocumentId = documentId;
          reason = best.reason;
          resolutionEvidence = {
            kind: best.candidateKind,
            candidateId: best.candidateId,
            documentId,
            quote: best.evidenceQuote,
            confidence: best.confidence,
            judgmentVersion: RESOLUTION_JUDGMENT_VERSION,
          };
          actionItemsResolved++;
        }
      }

      // keeping a done whose supporting evidence no longer exists is a worse lie than reverting to what
      // extraction actually observed
      if (
        statusSource === ProjectActionItemStatusSource.extracted &&
        item.statusSource !== ProjectActionItemStatusSource.extracted
      ) {
        actionItemsReverted++;
        this.logger.warn(
          `Reverting action item ${item.id} (${item.title}) from ${item.statusSource}/${item.status} to the extracted aggregate: its evidence no longer resolves it`,
        );
      }

      proposals.push({
        actionItemId: item.id,
        title: item.title,
        previousStatus: item.status,
        previousStatusSource: item.statusSource,
        status: finalStatus,
        statusSource,
        resolvedByDocumentId,
        reason,
        evidenceQuote: supporting[0]?.evidenceQuote ?? null,
        confidence: supporting[0]?.confidence ?? null,
        conflicted: supporting.length > 0 && contradicting.length > 0,
        candidateCount: evidence.candidates.length,
      });

      updates.push(
        this.prisma.projectActionItem.update({
          where: { id: item.id },
          data: {
            status: finalStatus,
            statusSource,
            reason,
            resolvedByDocumentId,
            resolvedByRepositoryFileId: null,
            resolvedByRepositoryFilePath: null,
            resolvedBySymbolId: null,
            resolvedAt: statusSource === ProjectActionItemStatusSource.extracted ? null : new Date(),
            resolutionEvidence: resolutionEvidence ?? Prisma.DbNull,
            resolutionEvidenceDigest: digests[itemIndex],
            resolutionAttemptedAt: new Date(),
          },
        }),
      );
    }

    // the digest gates the llm call, never the aggregate. a member flipping open -> blocked changes what
    // extraction observed while leaving the evidence set byte-identical, so skipped items still get their
    // baseline refreshed - but only when nothing has resolved them, so provenance is never clobbered
    const judgeableIndexSet = new Set(judgeableIndices);

    for (let itemIndex = 0; itemIndex < resolvableItems.length; itemIndex++) {
      const item = resolvableItems[itemIndex];

      if (judgeableIndexSet.has(itemIndex) || item.statusSource !== ProjectActionItemStatusSource.extracted) {
        continue;
      }

      const aggregate = aggregateMemberStatus(item.documentActionItems);

      if (aggregate !== item.status) {
        updates.push(
          this.prisma.projectActionItem.update({ where: { id: item.id }, data: { status: aggregate } }),
        );
      }
    }

    if (options.dryRun) {
      this.logger.log(`Dry run: ${updates.length} update(s) withheld`);
    } else {
      for (let offset = 0; offset < updates.length; offset += RESOLUTION_WRITE_CHUNK_SIZE) {
        await this.prisma.$transaction(updates.slice(offset, offset + RESOLUTION_WRITE_CHUNK_SIZE));
      }
    }

    const result: ProjectActionItemResolveResult = {
      actionItemsExamined: items.length,
      actionItemsJudged: judgeableIndices.length,
      actionItemsSkipped: skippedByDigest,
      actionItemsResolved,
      actionItemsReverted,
      actionItemsConflicted,
      quoteRejections,
      proposals,
    };

    this.logger.log(
      `Action-item resolution complete for project ${projectId}: ${JSON.stringify({ ...result, proposals: proposals.length })}`,
    );

    return result;
  }

  // the resolution batcher is token-bounded as well as count-bounded because candidate text dominates the prompt
  _buildBoundedActionItemResolutionBatches(
    judgeableIndices: number[],
    actionItemTexts: string[],
    evidenceByItem: ActionItemResolutionEvidence[],
  ): number[][] {
    const batches: number[][] = [];
    let current: number[] = [];
    let currentTokens = 0;

    for (const itemIndex of judgeableIndices) {
      const itemTokens = encode(
        [actionItemTexts[itemIndex], ...evidenceByItem[itemIndex].candidates.map((candidate) => candidate.text)].join(
          "\n",
        ),
      ).length;
      const exceedsCount = current.length >= ACTION_ITEM_RESOLUTION_BATCH_SIZE;
      const exceedsTokens = current.length > 0 && currentTokens + itemTokens > ACTION_ITEM_RESOLUTION_BATCH_TOKENS;

      if (exceedsCount || exceedsTokens) {
        batches.push(current);
        current = [];
        currentTokens = 0;
      }

      current.push(itemIndex);
      currentTokens += itemTokens;
    }

    if (current.length > 0) {
      batches.push(current);
    }

    return batches;
  }

  // code evidence is deliberately absent: measured over this corpus, no code candidate ever came nearer than a good
  // document match and no distance separated a relevant file from an irrelevant one, so it only ever added a weak
  // candidate for the judge to over-read. revive it only once code is retrievable (symbol-level embeddings, or
  // summaries written with the action items in view), and re-measure that separation before trusting it
  async _findActionItemResolutionEvidence({
    projectId,
    itemTime,
    embedding,
  }: {
    projectId: string;
    itemTime: Date;
    embedding: number[];
  }): Promise<ActionItemResolutionEvidence> {
    const laterStatements = await this.prisma.$queryRaw<
      { id: string; textDerived: string; textRaw: string | null; projectDocumentId: string }[]
    >`
      SELECT s.id, s."textDerived", s."textRaw", s."projectDocumentId"
      FROM "ProjectDocumentStatement" s
      JOIN "ProjectDocument" d ON d.id = s."projectDocumentId"
      WHERE s."projectId" = ${projectId}::uuid
        AND s."textDerivedEmbedding" IS NOT NULL
        AND s."suppressed" = false
        AND d."occurredAt" > ${itemTime}
        AND d."type"::text NOT IN (${Prisma.join(RESOLUTION_EXCLUDED_EVIDENCE_TYPES)})
        AND (s."textDerivedEmbedding" <=> ${`[${embedding.join(",")}]`}::halfvec) <= ${RESOLUTION_DOCUMENT_DISTANCE_THRESHOLD}
      ORDER BY s."textDerivedEmbedding" <=> ${`[${embedding.join(",")}]`}::halfvec
      LIMIT ${RESOLUTION_CANDIDATE_LIMIT}
    `;

    const candidates = laterStatements.map((candidate) => ({
      id: candidate.id,
      // the german source is shown alongside the english derivation so a quote may be taken verbatim from either
      text: candidate.textRaw ? `${candidate.textDerived}\n(source) ${candidate.textRaw}` : candidate.textDerived,
      kind: "document" as const,
    }));

    return {
      candidates,
      documentIdByCandidateId: new Map(laterStatements.map((candidate) => [candidate.id, candidate.projectDocumentId])),
      digestEntries: candidates.map(
        (candidate) =>
          `${candidate.kind}:${candidate.id}:${createHash("sha256").update(candidate.text).digest("hex")}`,
      ),
    };
  }
}
