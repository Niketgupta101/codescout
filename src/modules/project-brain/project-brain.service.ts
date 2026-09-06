import { Injectable, Logger } from "@nestjs/common";
import {
  Prisma,
  ProjectActionItemStatusSource,
  ProjectCorrectionEntity,
  ProjectCorrectionOperation,
  ProjectDataOrigin,
  ProjectDocumentActionItemStatus,
  ProjectDocumentDecisionStatus,
  ProjectDocumentImplementationStatus,
  ProjectDocumentReferenceResolution,
  ProjectDocumentStatementType,
  ProjectTopicType,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { OpenAIService } from "../openai/openai.service";
import { ProjectCorrectionService } from "../project-correction/project-correction.service";

// raw row shape from the semantic-search query, before the document columns are nested
type ProjectBrainStatementRow = {
  id: string;
  textRaw: string;
  textDerived: string;
  type: string;
  decisionStatus: string | null;
  implementationStatus: string | null;
  reason: string | null;
  actor: string | null;
  occurredAt: Date;
  validUntil: Date | null;
  replacesPriorStatementText: string | null;
  projectDocumentId: string;
  documentName: string;
  documentOccurredAt: Date;
  documentType: string;
};

type ProjectBrainDocumentSearchRow = {
  id: string;
  name: string;
  path: string;
  type: string;
  occurredAt: Date;
  summary: string | null;
  similarity: number;
};

const MAX_READ_DOCUMENT_LINES = 1500;
const MAX_DOCUMENT_TEXT_SEARCH_RESULTS = 20;
const MAX_DOCUMENT_TEXT_SEARCH_EXCERPTS = 5;

@Injectable()
export class ProjectBrainService {
  readonly logger = new Logger(ProjectBrainService.name);

  constructor(
    readonly prisma: PrismaService,
    readonly openaiService: OpenAIService,
    readonly projectCorrectionService: ProjectCorrectionService,
  ) {}

  async actionItemList({
    projectId,
    status,
    owner,
    topicId,
    stale,
  }: {
    projectId: string;
    status?: ProjectDocumentActionItemStatus;
    owner?: string;
    topicId?: string;
    stale?: boolean;
  }) {
    const items = await this.prisma.projectActionItem.findMany({
      where: {
        projectId,
        ...(status ? { status } : {}),
        ...(typeof stale === "boolean" ? { stale } : {}),
        ...(owner ? { owner: { contains: owner, mode: "insensitive" } } : {}),

        // canonical items link to a topic only through their per-document members
        ...(topicId ? { documentActionItems: { some: { projectDocumentTopic: { projectTopicId: topicId } } } } : {}),
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        title: true,
        description: true,
        owner: true,
        expectedBy: true,
        status: true,
        statusSource: true,
        reason: true,
        origin: true,
        stale: true,
        resolvedAt: true,
        updatedAt: true,

        // the cited quote and confidence behind an auto-resolution, so a verdict can be checked without the db
        resolutionEvidence: true,

        // decisive signal that set the status, resolved to a human-readable document
        resolvedByDocument: { select: { name: true, occurredAt: true, type: true } },

        // provenance: which meetings raised this, plus any blocker (blockedOn lives on members)
        documentActionItems: {
          select: {
            blockedOn: true,
            projectDocument: { select: { name: true, occurredAt: true } },
          },
          orderBy: { projectDocument: { occurredAt: "asc" } },
        },
      },
    });

    return items.map(({ documentActionItems, ...rest }) => ({
      ...rest,
      members: documentActionItems.map((member) => ({
        document: member.projectDocument.name,
        occurredAt: member.projectDocument.occurredAt,
        blockedOn: member.blockedOn,
      })),
    }));
  }

  async topicList({ projectId }: { projectId: string }) {
    return this.prisma.projectTopic.findMany({
      where: { projectId, suppressed: false },
      select: { id: true, name: true, type: true, summary: true, origin: true },
    });
  }

  async statementSearch({
    projectId,
    query,
    type,
    decisionStatus,
    implementationStatus,
    includeSuperseded,
    limit,
  }: {
    projectId: string;
    query: string;
    type?: ProjectDocumentStatementType;
    decisionStatus?: ProjectDocumentDecisionStatus;
    implementationStatus?: ProjectDocumentImplementationStatus;
    includeSuperseded?: boolean;
    limit?: number;
  }) {
    const { embedding } = await this.openaiService.generateEmbedding({ input: query });
    const vector = `[${embedding.join(",")}]`;

    // by default return only the CURRENT decision state - exclude both overturned (superseded) and declined (rejected)
    // decisions, since surfacing either as an equal peer misleads: a superseded choice reads as still-current, and a
    // rejected proposal ("considered and rejected: remove the LCD") reads as an actual outcome. accepted/open/deferred
    // and plain facts stay. the row still carries validUntil + what it replaced, so "what changed" stays answerable;
    // opt back in with includeSuperseded (or query a specific decisionStatus).
    const currentOnly =
      includeSuperseded || decisionStatus
        ? Prisma.empty
        : Prisma.sql`AND s."decisionStatus" IS DISTINCT FROM 'superseded'::"ProjectDocumentDecisionStatus"
            AND s."decisionStatus" IS DISTINCT FROM 'rejected'::"ProjectDocumentDecisionStatus"`;

    const rows = await this.prisma.$queryRaw<ProjectBrainStatementRow[]>`
      SELECT
        s.id, s."textRaw", s."textDerived", s.type, s."decisionStatus", s."implementationStatus",
        s.reason, s.actor, s."occurredAt", s."validUntil", s."replacesPriorStatementText", s."projectDocumentId",
        d.name AS "documentName", d."occurredAt" AS "documentOccurredAt", d.type AS "documentType"
      FROM "ProjectDocumentStatement" s
      JOIN "ProjectDocument" d ON d.id = s."projectDocumentId"
      WHERE s."projectId" = ${projectId}::uuid
        AND s."textDerivedEmbedding" IS NOT NULL
        AND s."suppressed" = false
        ${currentOnly}
        ${type ? Prisma.sql`AND s.type = ${type}::"ProjectDocumentStatementType"` : Prisma.empty}
        ${decisionStatus ? Prisma.sql`AND s."decisionStatus" = ${decisionStatus}::"ProjectDocumentDecisionStatus"` : Prisma.empty}
        ${implementationStatus ? Prisma.sql`AND s."implementationStatus" = ${implementationStatus}::"ProjectDocumentImplementationStatus"` : Prisma.empty}
      ORDER BY s."textDerivedEmbedding" <=> ${vector}::halfvec
      LIMIT ${limit ?? 10}
    `;

    // nest the joined document columns so the agent gets a citable source per hit
    return rows.map(({ documentName, documentOccurredAt, documentType, ...rest }) => ({
      ...rest,
      document: { name: documentName, occurredAt: documentOccurredAt, type: documentType },
    }));
  }

  async documentSearch({
    projectId,
    query,
    type,
    topK = 5,
  }: {
    projectId: string;
    query: string;
    type?: string;
    topK?: number;
  }) {
    const { embedding } = await this.openaiService.generateEmbedding({ input: query });
    const vector = `[${embedding.join(",")}]`;

    return this.prisma.$queryRaw<ProjectBrainDocumentSearchRow[]>`
      SELECT
        d.id, d.name, d.path, d.type, d."occurredAt", d.summary,
        1 - (d."summaryEmbedding" <=> ${vector}::halfvec) AS similarity
      FROM "ProjectDocument" d
      WHERE d."projectId" = ${projectId}::uuid
        AND d."summaryEmbedding" IS NOT NULL
        ${type ? Prisma.sql`AND d.type = ${type}::"ProjectDocumentType"` : Prisma.empty}
      ORDER BY d."summaryEmbedding" <=> ${vector}::halfvec
      LIMIT ${topK}
    `;
  }

  async documentTextSearch({ projectId, query }: { projectId: string; query: string }) {
    const documents = await this.prisma.projectDocument.findMany({
      where: { projectId, contentRaw: { contains: query, mode: "insensitive" } },
      select: { id: true, name: true, path: true, type: true, occurredAt: true, contentRaw: true },
      take: MAX_DOCUMENT_TEXT_SEARCH_RESULTS,
      orderBy: { occurredAt: "desc" },
    });
    const normalizedQuery = query.toLocaleLowerCase();

    return documents.map((document) => {
      const excerpts = document.contentRaw
        .split("\n")
        .flatMap((line, index) =>
          line.toLocaleLowerCase().includes(normalizedQuery) ? [`${index + 1}: ${line.trim()}`] : [],
        )
        .slice(0, MAX_DOCUMENT_TEXT_SEARCH_EXCERPTS);

      return {
        document: {
          id: document.id,
          name: document.name,
          path: document.path,
          type: document.type,
          occurredAt: document.occurredAt,
        },
        excerpts,
      };
    });
  }

  async documentRead({
    projectId,
    documentId,
    statementId,
  }: {
    projectId: string;
    documentId?: string;
    statementId?: string;
  }) {
    const statement = statementId
      ? await this.prisma.projectDocumentStatement.findFirst({
          where: { id: statementId, projectId },
          select: { id: true, projectDocumentId: true, textRaw: true, textDerived: true },
        })
      : null;

    if (statementId && !statement) {
      throw new Error(`Statement ${statementId} not found in project ${projectId}`);
    }

    if (documentId && statement && documentId !== statement.projectDocumentId) {
      throw new Error(`Statement ${statementId ?? ""} does not belong to document ${documentId}`);
    }

    const resolvedDocumentId = documentId ?? statement?.projectDocumentId;

    if (!resolvedDocumentId) {
      throw new Error("documentId or statementId is required");
    }

    const document = await this.prisma.projectDocument.findFirst({
      where: { id: resolvedDocumentId, projectId },
      select: { id: true, name: true, path: true, type: true, occurredAt: true, contentRaw: true },
    });

    if (!document) {
      throw new Error(`Document ${resolvedDocumentId} not found in project ${projectId}`);
    }

    return {
      document: {
        id: document.id,
        name: document.name,
        path: document.path,
        type: document.type,
        occurredAt: document.occurredAt,
      },
      ...(statement && {
        statement: {
          id: statement.id,
          textRaw: statement.textRaw,
          textDerived: statement.textDerived,
          sourceTextLocated: this._statementSourceOffset(document.contentRaw, statement) !== null,
        },
      }),
      content: document.contentRaw,
      totalLines: document.contentRaw.split("\n").length,
    };
  }

  async documentReadRange({
    projectId,
    documentId,
    statementId,
    startLine,
    endLine,
  }: {
    projectId: string;
    documentId?: string;
    statementId?: string;
    startLine?: number;
    endLine?: number;
  }) {
    const documentResult = await this.documentRead({ projectId, documentId, statementId });
    const lines = documentResult.content.split("\n");
    const statement = documentResult.statement;
    const sourceOffset =
      statement && statementId
        ? this._statementSourceOffset(documentResult.content, {
            textRaw: statement.textRaw,
            textDerived: statement.textDerived,
          })
        : null;
    const statementLine =
      sourceOffset === null ? null : documentResult.content.slice(0, sourceOffset).split("\n").length;
    const rangeStart = startLine ?? Math.max(1, (statementLine ?? 1) - 20);
    const requestedEnd = endLine ?? (statementLine ?? rangeStart) + 20;

    if (
      !Number.isInteger(rangeStart) ||
      !Number.isInteger(requestedEnd) ||
      rangeStart < 1 ||
      requestedEnd < rangeStart
    ) {
      throw new Error(
        `Invalid line range: startLine=${rangeStart}, endLine=${requestedEnd}. Must satisfy 1 <= startLine <= endLine.`,
      );
    }

    const clampedEnd = Math.min(requestedEnd, lines.length);
    const cappedEnd = Math.min(clampedEnd, rangeStart + MAX_READ_DOCUMENT_LINES - 1);
    const truncated = cappedEnd < clampedEnd;
    let content = lines.slice(rangeStart - 1, cappedEnd).join("\n");

    if (truncated) {
      content += `\n\n[range capped at line ${cappedEnd} (${MAX_READ_DOCUMENT_LINES} max) - call projectDocumentReadRange again with a later startLine to continue]`;
    }

    return {
      ...documentResult,
      content,
      totalLines: lines.length,
      range: { startLine: rangeStart, endLine: cappedEnd, truncated },
    };
  }

  // extraction usually retains the source wording in textRaw; textDerived is a fallback for extractors that do not.
  _statementSourceOffset(content: string, statement: { textRaw: string; textDerived: string }): number | null {
    for (const candidate of [statement.textRaw, statement.textDerived]) {
      const exactOffset = content.indexOf(candidate);

      if (exactOffset >= 0) {
        return exactOffset;
      }

      const whitespaceFlexible = candidate
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\s+/g, "\\s+");

      if (whitespaceFlexible.length === 0) {
        continue;
      }

      const match = new RegExp(whitespaceFlexible, "i").exec(content);

      if (match?.index !== undefined) {
        return match.index;
      }
    }

    return null;
  }

  async referenceList({
    projectId,
    resolution,
  }: {
    projectId: string;
    resolution?: ProjectDocumentReferenceResolution;
  }) {
    const references = await this.prisma.projectDocumentReference.findMany({
      where: { projectId, suppressed: false, ...(resolution ? { resolution } : {}) },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        referentText: true,
        expectation: true,
        resolution: true,
        resolvedToStatementId: true,
        fromProjectDocument: { select: { name: true, occurredAt: true } },
        resolvedToDocument: { select: { name: true, occurredAt: true } },
      },
    });

    return references.map(({ fromProjectDocument, ...rest }) => ({
      ...rest,
      fromDocument: fromProjectDocument,
    }));
  }

  // human sets a canonical action item's status; pinned (statusSource=manual, origin=human) against automated recompute
  async actionItemStatusSet({
    projectId,
    actionItemId,
    status,
    correctedByUserId,
  }: {
    projectId: string;
    actionItemId: string;
    status: ProjectDocumentActionItemStatus;
    correctedByUserId: string;
  }) {
    const actionItem = await this.prisma.projectActionItem.findFirst({
      where: { id: actionItemId, projectId },
      select: { id: true },
    });

    if (!actionItem) {
      throw new Error(`Action item ${actionItemId} not found in project ${projectId}`);
    }

    return this.prisma.projectActionItem.update({
      where: { id: actionItem.id },
      data: {
        status,
        statusSource: ProjectActionItemStatusSource.manual,
        origin: ProjectDataOrigin.human,
        resolvedByUserId: correctedByUserId,
        resolvedAt: new Date(),
      },
    });
  }

  // human renames/retypes a canonical topic; pinned (origin=human) so canonicalization leaves it untouched
  async topicCorrect({
    projectId,
    topicId,
    name,
    type,
    correctedByUserId,
  }: {
    projectId: string;
    topicId: string;
    name?: string;
    type?: ProjectTopicType;
    correctedByUserId: string;
  }) {
    const topic = await this.prisma.projectTopic.findFirst({
      where: { id: topicId, projectId },
      select: { id: true },
    });

    if (!topic) {
      throw new Error(`Topic ${topicId} not found in project ${projectId}`);
    }

    // ProjectTopic has no user column; the actor is logged for audit only
    this.logger.log(`Topic ${topicId} corrected by user ${correctedByUserId}`);

    return this.prisma.projectTopic.update({
      where: { id: topic.id },
      data: { ...(name ? { name } : {}), ...(type ? { type } : {}), origin: ProjectDataOrigin.human },
    });
  }

  async statementCorrect({
    projectId,
    statementId,
    operation,
    patch,
    note,
    correctedByUserId,
  }: {
    projectId: string;
    statementId: string;
    operation: ProjectCorrectionOperation;
    patch: Prisma.InputJsonValue;
    note?: string;
    correctedByUserId: string;
  }) {
    return this.projectCorrectionService.correctionCreate({
      projectId,
      entity: ProjectCorrectionEntity.statement,
      operation,
      targetId: statementId,
      patch,
      note,
      correctedByUserId,
    });
  }

  async referenceCorrect({
    projectId,
    referenceId,
    operation,
    patch,
    note,
    correctedByUserId,
  }: {
    projectId: string;
    referenceId: string;
    operation: ProjectCorrectionOperation;
    patch: Prisma.InputJsonValue;
    note?: string;
    correctedByUserId: string;
  }) {
    return this.projectCorrectionService.correctionCreate({
      projectId,
      entity: ProjectCorrectionEntity.reference,
      operation,
      targetId: referenceId,
      patch,
      note,
      correctedByUserId,
    });
  }
}
