import { Injectable, Logger } from "@nestjs/common";
import { Prisma, ProjectDocumentDecisionStatus, ProjectDocumentImplementationStatus, ProjectTopicType } from "@prisma/client";
import type { ProjectDocumentStatement } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { OpenAIService } from "../openai/openai.service";
import type { ProjectReconcileResult } from "./types/project-reconcile-result.type";
import type { ProjectReconcileStatementState } from "./types/project-reconcile-statement-state.type";

const SUPERSESSION_CONFIDENCE_THRESHOLD = 0.6;
const SUPERSESSION_CANDIDATE_LIMIT = 5;

// member statements sampled per doc-topic for the grouping prompt and drop-routing embeddings (keeps prompts bounded)
const TOPIC_MEMBER_STATEMENT_SAMPLE = 8;

@Injectable()
export class ProjectReconcileService {
  readonly logger = new Logger(ProjectReconcileService.name);

  constructor(
    readonly prisma: PrismaService,
    readonly openaiService: OpenAIService,
  ) {}

  /**
   * Recomputes a project's relational statement layer (bi-temporal validity + supersession threading).
   * The new state is computed entirely in memory and applied in a single transaction, so a failure
   * mid-run never leaves the brain partially reset.
   * @param projectId - the project to reconcile
   */
  async reconcile(projectId: string): Promise<ProjectReconcileResult> {
    this.logger.log(`Reconciling project ${projectId}`);

    // canonicalize topics first so threading has a stable, cross-document topic graph to work against
    const { topicsCreated, topicsMatched } = await this._canonicalizeProjectTopics(projectId);

    const statements = await this.prisma.projectDocumentStatement.findMany({
      where: { projectId },
      orderBy: { occurredAt: "asc" },
    });

    this.logger.log(`Threading ${statements.length} statements`);

    // start every statement from its local (extraction-time) state - validFrom set, nothing superseded
    const desiredStates = new Map<string, ProjectReconcileStatementState>();

    for (const statement of statements) {
      const local = this._localStatuses(statement);
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

    // thread each hint-carrying statement onto the prior statement it replaces
    for (const statement of statements) {
      if (!statement.replacesPriorStatementText) {
        continue;
      }

      const prior = await this._findSupersededStatement({ projectId, statement });

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

    this.logger.log(
      `Reconcile complete for project ${projectId}: ${topicsCreated} topics created, ${topicsMatched} matched, ${supersessionsLinked} supersessions linked`,
    );

    return { projectId, topicsCreated, topicsMatched, statementsReconciled: statements.length, supersessionsLinked };
  }

  /**
   * Canonicalizes the project's per-document topics into durable ProjectTopics.
   * Distinct doc-topics are matched into existing canonical topics by embedding distance (a clear distance joins
   * deterministically, a borderline one defers to an LLM tie-break); whatever is left over is grouped into a small set
   * of new topics by one holistic LLM call. Applied in one atomic transaction so existing topics are never wiped -
   * ids stay stable and a matched topic keeps its summary untouched.
   * @param projectId - the project whose topics to canonicalize
   */
  async _canonicalizeProjectTopics(projectId: string): Promise<{ topicsCreated: number; topicsMatched: number }> {
    const documentTopics = await this.prisma.projectDocumentTopic.findMany({
      where: { projectId },
      select: { id: true, name: true },
    });

    if (documentTopics.length === 0) {
      return { topicsCreated: 0, topicsMatched: 0 };
    }

    const distinctNames = [...new Set(documentTopics.map((documentTopic) => documentTopic.name))];

    this.logger.log(`Canonicalizing ${distinctNames.length} distinct topics from ${documentTopics.length} doc-topics`);

    // sample each distinct topic's statements once - reused for the grouping prompt and drop-routing embeddings
    const statementsByName = await this._sampleStatementsByTopicName({ projectId, names: distinctNames });

    // existing canonical topics the grouping call can fold matching doc-topics into (empty on a cold project)
    const existingTopics = await this.prisma.projectTopic.findMany({
      where: { projectId },
      select: { id: true, name: true, summary: true },
    });

    const { newTopicPayloads, matches } = await this._buildTopicsFromGrouping({
      projectId,
      distinctNames,
      statementsByName,
      existingTopics,
    });

    // fold-into-existing decisions link straight to the existing topic id; new topics are created in the transaction
    const topicIdByName = new Map<string, string>();
    const matchedTopicIds = new Set<string>();

    for (const match of matches) {
      topicIdByName.set(match.name, match.topicId);
      matchedTopicIds.add(match.topicId);
    }

    this.logger.log(
      `Folded ${matches.length} doc-topics into ${matchedTopicIds.size} existing topics, created ${newTopicPayloads.length} new topics`,
    );

    if (newTopicPayloads.length > 0) {
      this.logger.log(`New topics: ${newTopicPayloads.map((payload) => payload.name).join(", ")}`);
    }

    // apply atomically: create new topics (matched ones need no change), then link every doc-topic
    await this.prisma.$transaction(
      async (tx) => {
        for (const payload of newTopicPayloads) {
          const topic = await tx.projectTopic.create({
            data: { projectId, name: payload.name, type: payload.type, summary: payload.summary },
          });

          // summaryEmbedding is an unsupported halfvec column so it is written via raw sql
          await tx.$executeRaw`
            UPDATE "ProjectTopic"
            SET "summaryEmbedding" = ${`[${payload.embedding.join(",")}]`}::halfvec
            WHERE id = ${topic.id}::uuid
          `;

          for (const memberName of payload.memberNames) {
            topicIdByName.set(memberName, topic.id);
          }
        }

        for (const documentTopic of documentTopics) {
          const topicId = topicIdByName.get(documentTopic.name);

          if (!topicId) {
            continue;
          }

          await tx.projectDocumentTopic.update({
            where: { id: documentTopic.id },
            data: { projectTopicId: topicId },
          });
        }
      },
      { timeout: 30000 },
    );

    return { topicsCreated: newTopicPayloads.length, topicsMatched: matchedTopicIds.size };
  }

  // samples up to TOPIC_MEMBER_STATEMENT_SAMPLE textDerived statements per topic name, for embedding and prompts
  async _sampleStatementsByTopicName({
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

  // finds the nearest existing canonical topic to an embedding via the halfvec cosine operator
  async _findNearestTopicAnchor({
    projectId,
    embedding,
  }: {
    projectId: string;
    embedding: number[];
  }): Promise<{ id: string; name: string; summary: string | null; distance: number } | null> {
    const rows = await this.prisma.$queryRaw<{ id: string; name: string; summary: string | null; distance: number }[]>`
      SELECT id, name, summary, ("summaryEmbedding" <=> ${`[${embedding.join(",")}]`}::halfvec) AS distance
      FROM "ProjectTopic"
      WHERE "projectId" = ${projectId}::uuid
        AND "summaryEmbedding" IS NOT NULL
      ORDER BY distance ASC
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  // places every distinct doc-topic via one anchor-aware grouping call: members either fold into an existing canonical
  // topic (match) or seed a new one (payload). any name the model drops is routed to its nearest new topic or existing
  // anchor so no doc-topic is left unlinked.
  async _buildTopicsFromGrouping({
    projectId,
    distinctNames,
    statementsByName,
    existingTopics,
  }: {
    projectId: string;
    distinctNames: string[];
    statementsByName: Map<string, string[]>;
    existingTopics: { id: string; name: string; summary: string | null }[];
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
    const { groups } = await this.openaiService.generateTopicGrouping({
      existingTopics,
      topics: distinctNames.map((name) => ({ name, statements: statementsByName.get(name) ?? [] })),
      types: Object.values(ProjectTopicType),
    });

    const distinctSet = new Set(distinctNames);
    const existingIds = new Set(existingTopics.map((topic) => topic.id));
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
      const memberNames = group.memberNames.filter((name) => distinctSet.has(name) && !placedNames.has(name));

      if (memberNames.length === 0) {
        continue;
      }

      memberNames.forEach((name) => placedNames.add(name));

      // fold into an existing canonical topic when the model matched one; its summary is left untouched
      if (group.matchTopicId && existingIds.has(group.matchTopicId)) {
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

    // route any name the model dropped to its nearest new topic, else its nearest existing anchor, else a singleton
    for (const name of distinctNames) {
      if (placedNames.has(name)) {
        continue;
      }

      placedNames.add(name);

      const { embedding } = await this.openaiService.generateEmbedding({
        input: [name, ...(statementsByName.get(name) ?? [])].join("\n"),
      });

      let nearest: (typeof newTopicPayloads)[number] | null = null;
      let nearestDistance = Infinity;

      for (const payload of newTopicPayloads) {
        const distance = this._cosineDistance(embedding, payload.embedding);

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = payload;
        }
      }

      if (nearest) {
        nearest.memberNames.push(name);
        continue;
      }

      const anchor = existingTopics.length > 0 ? await this._findNearestTopicAnchor({ projectId, embedding }) : null;

      if (anchor) {
        matches.push({ name, topicId: anchor.id });
      } else {
        newTopicPayloads.push({ name, type: null, summary: name, embedding, memberNames: [name] });
      }
    }

    return { newTopicPayloads, matches };
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
  }: {
    projectId: string;
    statement: ProjectDocumentStatement;
  }): Promise<ProjectDocumentStatement | null> {
    if (!statement.replacesPriorStatementText) {
      return null;
    }

    const { embedding } = await this.openaiService.generateEmbedding({ input: statement.replacesPriorStatementText });

    // nearest earlier statements in the same project, ranked by the prior-decision hint
    const candidates = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM "ProjectDocumentStatement"
      WHERE "projectId" = ${projectId}::uuid
        AND "occurredAt" < ${statement.occurredAt}
        AND id != ${statement.id}::uuid
        AND "textDerivedEmbedding" IS NOT NULL
      ORDER BY "textDerivedEmbedding" <=> ${`[${embedding.join(",")}]`}::halfvec
      LIMIT ${SUPERSESSION_CANDIDATE_LIMIT}
    `;

    for (const candidate of candidates) {
      const prior = await this.prisma.projectDocumentStatement.findUnique({ where: { id: candidate.id } });

      if (!prior) {
        continue;
      }

      const judgment = await this.openaiService.generateStatementSupersessionJudgment({
        newStatement: statement.textDerived,
        priorStatement: prior.textDerived,
        hint: statement.replacesPriorStatementText,
      });

      if (judgment.supersedes && judgment.confidence >= SUPERSESSION_CONFIDENCE_THRESHOLD) {
        return prior;
      }
    }

    return null;
  }
}
