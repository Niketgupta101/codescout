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
        ...(topicId
          ? { documentActionItems: { some: { projectDocumentTopic: { projectTopicId: topicId } } } }
          : {}),
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
