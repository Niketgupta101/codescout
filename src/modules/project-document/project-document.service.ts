import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import * as path from "path";
import type { ProjectDocument } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { GoogleDriveService } from "../google-drive/google-drive.service";
import { MarkitdownService } from "../markitdown/markitdown.service";
import { IndexingService } from "../indexing/indexing.service";
import { stripNullBytes } from "../openai/utils/strip-null-bytes.util";
import type { CreateProjectDocumentDto } from "./dtos/create-project-document.dto";

@Injectable()
export class ProjectDocumentService {
  readonly logger = new Logger(ProjectDocumentService.name);

  constructor(
    readonly prisma: PrismaService,
    readonly googleDriveService: GoogleDriveService,
    readonly markitdownService: MarkitdownService,
    readonly indexingService: IndexingService,
  ) {}

  async create({ projectId, projectFolderId, provider, providerExternalId }: CreateProjectDocumentDto) {
    // google drive is the only source supported - providerExternalId only makes sense for it
    if (provider === "googleDrive") {
      if (!providerExternalId) {
        throw new Error("google drive document is missing providerExternalId");
      }

      const file = await this.googleDriveService.getFile({ fileId: providerExternalId });
      const buffer = await this.googleDriveService.downloadFile({ fileId: providerExternalId });
      const { markdown: rawMarkdown } = await this.markitdownService.convert({ buffer, filename: file.name });
      // strip null bytes at the ingestion boundary so postgres text columns accept the content
      const markdown = stripNullBytes(rawMarkdown);

      const checksum = createHash("sha256").update(markdown).digest("hex");
      // provisional; classify infers the real event date from the content
      const occurredAt = file.modifiedAt ?? new Date();
      const contentType = path.extname(file.name).replace(/^\./, "").toLowerCase();

      const projectDocument = await this.prisma.projectDocument.create({
        data: {
          projectId,
          projectFolderId,
          provider,
          providerExternalId,
          name: file.name,
          path: file.path,
          contentType,
          contentRaw: markdown,
          occurredAt,
          checksum,
          providerExternalModifiedAt: file.modifiedAt,
        },
      });

      await this.indexingService.projectDocumentIndex(projectDocument.id);
      await this.indexingService.projectDocumentClassify(projectDocument.id);
      await this.indexingService.projectDocumentExtract(projectDocument.id);

      return projectDocument;
    } else {
      throw new Error(`unsupported project document provider: ${provider as string}`);
    }
  }

  async importProjectDocument(projectDocument: ProjectDocument) {
    // google drive is the only source supported
    if (projectDocument.provider === "googleDrive") {
      return this._googleDriveProjectDocumentImport(projectDocument);
    } else {
      throw new Error(`unsupported project document provider: ${projectDocument.provider as string}`);
    }
  }

  // re-fetches a drive document from its stored coordinates, replaces its content and re-indexes
  async _googleDriveProjectDocumentImport(projectDocument: ProjectDocument) {
    if (!projectDocument.providerExternalId) {
      throw new Error("google drive document is missing providerExternalId");
    }

    let updated: ProjectDocument;

    try {
      const file = await this.googleDriveService.getFile({ fileId: projectDocument.providerExternalId });
      const buffer = await this.googleDriveService.downloadFile({ fileId: projectDocument.providerExternalId });
      const { markdown: rawMarkdown } = await this.markitdownService.convert({ buffer, filename: file.name });
      // strip null bytes at the ingestion boundary so postgres text columns accept the content
      const markdown = stripNullBytes(rawMarkdown);

      const checksum = createHash("sha256").update(markdown).digest("hex");
      // provisional; classify infers the real event date from the content
      const occurredAt = file.modifiedAt ?? new Date();
      const contentType = path.extname(file.name).replace(/^\./, "").toLowerCase();

      updated = await this.prisma.projectDocument.update({
        where: { id: projectDocument.id },
        data: {
          name: file.name,
          path: file.path,
          contentType,
          contentRaw: markdown,
          occurredAt,
          checksum,
          providerExternalModifiedAt: file.modifiedAt,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to fetch project document ${projectDocument.path}`, error);
      await this.prisma.projectDocument.update({
        where: { id: projectDocument.id },
        data: { status: "failed", error: message },
      });

      throw error;
    }

    await this.indexingService.projectDocumentIndex(updated.id);
    await this.indexingService.projectDocumentClassify(updated.id);
    await this.indexingService.projectDocumentExtract(updated.id);

    return updated;
  }
}
