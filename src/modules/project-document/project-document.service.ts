import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import { DocumentStatus } from "@prisma/client";
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
      const downloadedFile = await this.googleDriveService.downloadFile({ file });
      const { markdown: rawMarkdown } = await this.markitdownService.convert(downloadedFile);
      // strip null bytes at the ingestion boundary so postgres text columns accept the content
      const markdown = stripNullBytes(rawMarkdown);

      const checksum = createHash("sha256").update(markdown).digest("hex");
      // provisional; classify infers the real event date from the content
      const occurredAt = file.modifiedAt ?? new Date();

      // a copy or re-upload arrives as a new drive file carrying content the project has already extracted; alias it
      // onto that document rather than paying extraction again and splitting the knowledge across two documents
      const duplicate = await this._projectDocumentFindByChecksum({ projectId, checksum });

      if (duplicate) {
        this.logger.log(`Drive file ${file.path} duplicates document ${duplicate.path}, aliasing instead of indexing`);

        return this.prisma.projectDocument.update({
          where: { id: duplicate.id },
          data: {
            providerExternalIds: { push: providerExternalId },
            projectFolderId: duplicate.projectFolderId ?? projectFolderId,
          },
        });
      }

      const projectDocument = await this.prisma.projectDocument.create({
        data: {
          projectId,
          projectFolderId,
          provider,
          providerExternalIds: [providerExternalId],
          name: file.name,
          path: file.path,
          contentType: downloadedFile.contentType,
          contentRaw: markdown,
          occurredAt,
          checksum,
          providerExternalModifiedAt: file.modifiedAt,
        },
      });

      await this.indexingService.projectDocumentProcess(projectDocument.id);

      return projectDocument;
    } else {
      throw new Error(`unsupported project document provider: ${provider as string}`);
    }
  }

  async createManual({
    projectId,
    projectFolderId,
    name,
    content,
    occurredAt,
  }: {
    projectId: string;
    projectFolderId?: string;
    name: string;
    content: string;
    occurredAt?: Date;
  }) {
    const markdown = stripNullBytes(content);
    const checksum = createHash("sha256").update(markdown).digest("hex");

    // the same synthesized content submitted twice is one document, not two competing sets of statements
    const duplicate = await this._projectDocumentFindByChecksum({ projectId, checksum });

    if (duplicate) {
      this.logger.log(`Manual document ${name} duplicates document ${duplicate.path}, returning the existing document`);

      return duplicate;
    }

    const projectDocument = await this.prisma.projectDocument.create({
      data: {
        projectId,
        projectFolderId,
        provider: "manual",
        name,
        path: name,
        contentType: "text/markdown",
        contentRaw: markdown,
        occurredAt: occurredAt ?? new Date(),
        checksum,
      },
    });

    await this.indexingService.projectDocumentProcess(projectDocument.id);

    return projectDocument;
  }

  // content identity within a project: two documents are the same document when their converted markdown is identical.
  // the oldest match wins so the document that owns the extraction stays stable across repeated uploads
  async _projectDocumentFindByChecksum({ projectId, checksum }: { projectId: string; checksum: string }) {
    return this.prisma.projectDocument.findFirst({
      where: { projectId, checksum },
      orderBy: { createdAt: "asc" },
    });
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
    // the first id is the file this document was created from; later ids are duplicates that alias onto it
    const [providerExternalId] = projectDocument.providerExternalIds;

    if (!providerExternalId) {
      throw new Error("google drive document is missing providerExternalIds");
    }

    let updated: ProjectDocument;

    try {
      const file = await this.googleDriveService.getFile({ fileId: providerExternalId });
      const downloadedFile = await this.googleDriveService.downloadFile({ file });
      const { markdown: rawMarkdown } = await this.markitdownService.convert(downloadedFile);
      // strip null bytes at the ingestion boundary so postgres text columns accept the content
      const markdown = stripNullBytes(rawMarkdown);

      const checksum = createHash("sha256").update(markdown).digest("hex");
      // provisional; classify infers the real event date from the content
      const occurredAt = file.modifiedAt ?? new Date();

      // a move, a rename, or an edit that touched only drive metadata leaves the converted content byte-identical.
      // re-extracting it would delete and recreate every statement of this document under new ids, orphaning the
      // canonical links and reference resolutions built on them - so refresh the provider metadata and stop.
      // occurredAt is deliberately left alone here because classify inferred it from this same content
      if (checksum === projectDocument.checksum && projectDocument.status === DocumentStatus.completed) {
        this.logger.log(`Content unchanged for ${file.path}, keeping the existing extraction`);

        return await this.prisma.projectDocument.update({
          where: { id: projectDocument.id },
          data: {
            name: file.name,
            path: file.path,
            contentType: downloadedFile.contentType,
            providerExternalModifiedAt: file.modifiedAt,
          },
        });
      }

      updated = await this.prisma.projectDocument.update({
        where: { id: projectDocument.id },
        data: {
          name: file.name,
          path: file.path,
          contentType: downloadedFile.contentType,
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

    await this.indexingService.projectDocumentProcess(updated.id);

    return updated;
  }
}
