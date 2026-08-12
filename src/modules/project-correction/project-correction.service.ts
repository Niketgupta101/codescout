import { Injectable, Logger } from "@nestjs/common";
import {
  Prisma,
  ProjectCorrectionEntity,
  ProjectCorrectionOperation,
  ProjectCorrectionStatus,
  ProjectDataOrigin,
  ProjectDocumentDecisionStatus,
  ProjectDocumentImplementationStatus,
  ProjectDocumentReferenceResolution,
  ProjectDocumentStatementType,
} from "@prisma/client";
import type { ProjectDocumentCorrection } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { OpenAIService } from "../openai/openai.service";

// max cosine distance for re-binding a statement correction to a regenerated row when the verbatim anchor drifted
const STATEMENT_REBIND_MAX_DISTANCE = 0.15;

@Injectable()
export class ProjectCorrectionService {
  readonly logger = new Logger(ProjectCorrectionService.name);

  constructor(
    readonly prisma: PrismaService,
    readonly openaiService: OpenAIService,
  ) {}

  /**
   * Records a human correction to a per-document statement/reference and applies it immediately.
   * The correction is stored in the durable overlay with a stable anchor so it can be re-applied after the source
   * document is re-extracted (which regenerates the ai row with a new id).
   */
  async correctionCreate({
    projectId,
    entity,
    operation,
    targetId,
    patch,
    note,
    correctedByUserId,
  }: {
    projectId: string;
    entity: ProjectCorrectionEntity;
    operation: ProjectCorrectionOperation;
    targetId: string;
    patch: Prisma.InputJsonValue;
    note?: string;
    correctedByUserId: string;
  }): Promise<ProjectDocumentCorrection> {
    const anchor = await this._loadAnchor({ projectId, entity, targetId });

    const { embedding } = await this.openaiService.generateEmbedding({ input: anchor.embedInput });

    const correction = await this.prisma.projectDocumentCorrection.create({
      data: {
        projectId,
        projectDocumentId: anchor.projectDocumentId,
        entity,
        operation,
        anchorText: anchor.anchorText,
        patch,
        note,
        correctedByUserId,
      },
    });

    // anchorEmbedding is an unsupported halfvec column so it is written via raw sql
    await this.prisma.$executeRaw`
      UPDATE "ProjectDocumentCorrection"
      SET "anchorEmbedding" = ${`[${embedding.join(",")}]`}::halfvec
      WHERE id = ${correction.id}::uuid
    `;

    // apply straight to the known target so the caller sees the effect without waiting for a reconcile
    await this._applyToTarget({ entity, operation, targetId, patch });

    return correction;
  }

  /**
   * Re-applies every human correction onto the current ai rows, re-binding each to its regenerated row by anchor.
   * Idempotent - run as the first reconcile pass so later passes see the human-pinned rows. A correction whose anchor
   * no longer matches any row is flagged orphaned (surfaced for review, never dropped) and retried on later runs.
   * @param projectId - the project whose corrections to apply
   */
  async correctionsApply(projectId: string): Promise<{ correctionsApplied: number }> {
    const corrections = await this.prisma.projectDocumentCorrection.findMany({ where: { projectId } });

    if (corrections.length === 0) {
      return { correctionsApplied: 0 };
    }

    this.logger.log(`Applying ${corrections.length} corrections for project ${projectId}`);

    let correctionsApplied = 0;

    for (const correction of corrections) {
      const targetId = await this._rebind({ projectId, correction });

      if (!targetId) {
        if (correction.status !== ProjectCorrectionStatus.orphaned) {
          await this.prisma.projectDocumentCorrection.update({
            where: { id: correction.id },
            data: { status: ProjectCorrectionStatus.orphaned },
          });
        }

        this.logger.warn(
          `Correction ${correction.id} orphaned: no ${correction.entity} matches its anchor in project ${projectId}`,
        );

        continue;
      }

      await this._applyToTarget({
        entity: correction.entity,
        operation: correction.operation,
        targetId,
        patch: correction.patch as Prisma.InputJsonValue,
      });

      if (correction.status !== ProjectCorrectionStatus.active) {
        await this.prisma.projectDocumentCorrection.update({
          where: { id: correction.id },
          data: { status: ProjectCorrectionStatus.active },
        });
      }

      correctionsApplied++;
    }

    return { correctionsApplied };
  }

  // loads the anchor (document scope, verbatim anchor text, and text to embed) from the corrected row
  async _loadAnchor({
    projectId,
    entity,
    targetId,
  }: {
    projectId: string;
    entity: ProjectCorrectionEntity;
    targetId: string;
  }): Promise<{ projectDocumentId: string; anchorText: string; embedInput: string }> {
    if (entity === ProjectCorrectionEntity.statement) {
      const statement = await this.prisma.projectDocumentStatement.findFirst({
        where: { id: targetId, projectId },
        select: { projectDocumentId: true, textRaw: true, textDerived: true },
      });

      if (!statement) {
        throw new Error(`Statement ${targetId} not found in project ${projectId}`);
      }

      return {
        projectDocumentId: statement.projectDocumentId,
        anchorText: statement.textRaw,
        embedInput: statement.textDerived,
      };
    }

    const reference = await this.prisma.projectDocumentReference.findFirst({
      where: { id: targetId, projectId },
      select: { fromProjectDocumentId: true, referentText: true },
    });

    if (!reference) {
      throw new Error(`Reference ${targetId} not found in project ${projectId}`);
    }

    return {
      projectDocumentId: reference.fromProjectDocumentId,
      anchorText: reference.referentText,
      embedInput: reference.referentText,
    };
  }

  // re-binds a correction to the current ai row: exact verbatim anchor first, then (statements only) an embedding fallback
  async _rebind({
    projectId,
    correction,
  }: {
    projectId: string;
    correction: ProjectDocumentCorrection;
  }): Promise<string | null> {
    if (correction.entity === ProjectCorrectionEntity.statement) {
      const exact = await this.prisma.projectDocumentStatement.findFirst({
        where: {
          projectId,
          projectDocumentId: correction.projectDocumentId ?? undefined,
          textRaw: correction.anchorText ?? undefined,
        },
        select: { id: true },
      });

      if (exact) {
        return exact.id;
      }

      // verbatim span drifted - fall back to the nearest statement within a tight distance of the stored anchor
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT s.id
        FROM "ProjectDocumentStatement" s
        JOIN "ProjectDocumentCorrection" c ON c.id = ${correction.id}::uuid
        WHERE s."projectId" = ${projectId}::uuid
          AND s."textDerivedEmbedding" IS NOT NULL
          AND c."anchorEmbedding" IS NOT NULL
          AND (s."textDerivedEmbedding" <=> c."anchorEmbedding") < ${STATEMENT_REBIND_MAX_DISTANCE}
        ORDER BY (s."textDerivedEmbedding" <=> c."anchorEmbedding") ASC
        LIMIT 1
      `;

      return rows[0]?.id ?? null;
    }

    const reference = await this.prisma.projectDocumentReference.findFirst({
      where: {
        projectId,
        fromProjectDocumentId: correction.projectDocumentId ?? undefined,
        referentText: correction.anchorText ?? undefined,
      },
      select: { id: true },
    });

    return reference?.id ?? null;
  }

  // applies one correction to a known row: edit patches fields + pins origin=human; invalidate hides the row
  async _applyToTarget({
    entity,
    operation,
    targetId,
    patch,
  }: {
    entity: ProjectCorrectionEntity;
    operation: ProjectCorrectionOperation;
    targetId: string;
    patch: Prisma.InputJsonValue;
  }): Promise<void> {
    if (entity === ProjectCorrectionEntity.statement) {
      await this._applyStatementCorrection({ operation, targetId, patch });
      return;
    }

    await this._applyReferenceCorrection({ operation, targetId, patch });
  }

  async _applyStatementCorrection({
    operation,
    targetId,
    patch,
  }: {
    operation: ProjectCorrectionOperation;
    targetId: string;
    patch: Prisma.InputJsonValue;
  }): Promise<void> {
    // invalidate: a human marked this extraction wrong - hide it from queries and pin it
    if (operation === ProjectCorrectionOperation.invalidate) {
      await this.prisma.projectDocumentStatement.update({
        where: { id: targetId },
        data: { suppressed: true, origin: ProjectDataOrigin.human },
      });

      return;
    }

    // edit: patch the allowed fields and pin the row
    const data = this._statementUpdateData(patch);
    await this.prisma.projectDocumentStatement.update({ where: { id: targetId }, data });

    // keep the search embedding consistent when the derived text was rewritten
    const fields = this._asRecord(patch);

    if (typeof fields.textDerived === "string") {
      const { embedding } = await this.openaiService.generateEmbedding({ input: fields.textDerived });
      await this.prisma.$executeRaw`
        UPDATE "ProjectDocumentStatement"
        SET "textDerivedEmbedding" = ${`[${embedding.join(",")}]`}::halfvec
        WHERE id = ${targetId}::uuid
      `;
    }
  }

  async _applyReferenceCorrection({
    operation,
    targetId,
    patch,
  }: {
    operation: ProjectCorrectionOperation;
    targetId: string;
    patch: Prisma.InputJsonValue;
  }): Promise<void> {
    if (operation === ProjectCorrectionOperation.invalidate) {
      await this.prisma.projectDocumentReference.update({
        where: { id: targetId },
        data: { suppressed: true, origin: ProjectDataOrigin.human },
      });

      return;
    }

    const data = this._referenceUpdateData(patch);
    await this.prisma.projectDocumentReference.update({ where: { id: targetId }, data });
  }

  // builds a safe statement update from the patch, keeping only known fields and valid enum values; pins origin=human
  _statementUpdateData(patch: Prisma.InputJsonValue): Prisma.ProjectDocumentStatementUpdateInput {
    const fields = this._asRecord(patch);
    const data: Prisma.ProjectDocumentStatementUpdateInput = { origin: ProjectDataOrigin.human };

    if (typeof fields.textDerived === "string") {
      data.textDerived = fields.textDerived;
    }

    if (typeof fields.reason === "string") {
      data.reason = fields.reason;
    }

    if (
      typeof fields.type === "string" &&
      (Object.values(ProjectDocumentStatementType) as string[]).includes(fields.type)
    ) {
      data.type = fields.type as ProjectDocumentStatementType;
    }

    if (
      typeof fields.decisionStatus === "string" &&
      (Object.values(ProjectDocumentDecisionStatus) as string[]).includes(fields.decisionStatus)
    ) {
      data.decisionStatus = fields.decisionStatus as ProjectDocumentDecisionStatus;
    }

    if (
      typeof fields.implementationStatus === "string" &&
      (Object.values(ProjectDocumentImplementationStatus) as string[]).includes(fields.implementationStatus)
    ) {
      data.implementationStatus = fields.implementationStatus as ProjectDocumentImplementationStatus;
    }

    return data;
  }

  // builds a safe reference update from the patch, keeping only known fields and valid enum values; pins origin=human
  _referenceUpdateData(patch: Prisma.InputJsonValue): Prisma.ProjectDocumentReferenceUpdateInput {
    const fields = this._asRecord(patch);
    const data: Prisma.ProjectDocumentReferenceUpdateInput = { origin: ProjectDataOrigin.human };

    if (
      typeof fields.resolution === "string" &&
      (Object.values(ProjectDocumentReferenceResolution) as string[]).includes(fields.resolution)
    ) {
      data.resolution = fields.resolution as ProjectDocumentReferenceResolution;
    }

    if (typeof fields.resolvedToDocumentId === "string" || fields.resolvedToDocumentId === null) {
      data.resolvedToDocument = fields.resolvedToDocumentId
        ? { connect: { id: fields.resolvedToDocumentId } }
        : { disconnect: true };
    }

    if (typeof fields.resolvedToStatementId === "string" || fields.resolvedToStatementId === null) {
      data.resolvedToStatement = fields.resolvedToStatementId
        ? { connect: { id: fields.resolvedToStatementId } }
        : { disconnect: true };
    }

    return data;
  }

  _asRecord(patch: Prisma.InputJsonValue): Record<string, unknown> {
    return patch !== null && typeof patch === "object" && !Array.isArray(patch)
      ? (patch as Record<string, unknown>)
      : {};
  }
}
