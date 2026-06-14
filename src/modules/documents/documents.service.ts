import { Injectable, NotFoundException, Inject, forwardRef, Logger } from "@nestjs/common";
import { DocumentFormat } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { IndexingService } from "../indexing/indexing.service";
import { LocaleException } from "src/plugins/locale/nest/locale.exception";
import { getTempDirectories, cleanupTempDirectories } from "src/utils/file-upload.util";
import type { DocumentIndexingOptions } from "../indexing/types/document-indexing-options.type";
import type { CreateDocumentDto } from "./dtos/create-document.dto";
import type { UpdateDocumentStatusDto } from "./dtos/update-document-status.dto";
import type { IndexDocumentsOptions } from "./types/index-documents-options.type";

@Injectable()
export class DocumentsService {
  readonly logger = new Logger(DocumentsService.name);

  constructor(
    readonly prisma: PrismaService,
    @Inject(forwardRef(() => IndexingService))
    readonly indexingService: IndexingService,
  ) {}

  async create(dto: CreateDocumentDto) {
    return this.prisma.projectDocument.create({
      data: {
        projectId: dto.projectId,
        filename: dto.filename,
        format: dto.format,
        documentType: dto.documentType,
        metadata: dto.metadata,
        status: "pending",
      },
    });
  }

  async index(projectId: string, indexDocumentsOptions: IndexDocumentsOptions) {
    const { files, documentType } = indexDocumentsOptions;

    // validate files
    if (!files || files.length === 0) {
      throw LocaleException.badRequest({ message: "module.document.noFilesUploadedError" });
    }

    const tempDirectories = getTempDirectories(files);
    const documents: DocumentIndexingOptions[] = [];

    try {
      // create document records
      for (const file of files) {
        const format = this._getDocumentFormat(file.originalname);

        const document = await this.create({
          projectId,
          filename: file.originalname,
          format,
          documentType,
          metadata: { fileSize: file.size, mimeType: file.mimetype },
        });

        await this.updateStatus(document.id, { status: "indexing" });

        documents.push({
          path: file.path,
          format,
          originalName: file.originalname,
          documentId: document.id,
        });
      }

      // run indexing
      const result = await this.indexingService.indexDocuments(projectId, documents);

      // update statuses based on result
      for (const document of documents) {
        if (document.documentId) {
          const hasError = result.errors.some((error) => error.includes(document.path));
          await this.updateStatus(document.documentId, {
            status: hasError ? "failed" : "completed",
            error: hasError ? result.errors.find((error) => error.includes(document.path)) : undefined,
          });
        }
      }

      return result;
    } finally {
      await cleanupTempDirectories(tempDirectories);
    }
  }

  _getDocumentFormat(filename: string): DocumentFormat {
    const lowercaseFilename = filename.toLowerCase();
    if (lowercaseFilename.endsWith(".csv")) return DocumentFormat.csv;
    if (lowercaseFilename.endsWith(".md") || lowercaseFilename.endsWith(".markdown")) return DocumentFormat.markdown;
    if (lowercaseFilename.endsWith(".pdf")) return DocumentFormat.pdf;
    return DocumentFormat.csv;
  }

  async findByProject(projectId: string) {
    const documents = await this.prisma.projectDocument.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });

    return {
      items: documents,
      total: documents.length,
    };
  }

  async findOne(projectId: string, documentId: string) {
    const document = await this.prisma.projectDocument.findFirst({
      where: {
        id: documentId,
        projectId,
      },
    });

    if (!document) {
      throw new NotFoundException(`Document ${documentId} not found in project ${projectId}`);
    }

    return document;
  }

  async updateStatus(documentId: string, dto: UpdateDocumentStatusDto) {
    return this.prisma.projectDocument.update({
      where: { id: documentId },
      data: {
        status: dto.status,
        error: dto.error,
        updatedAt: new Date(),
      },
    });
  }

  async delete(projectId: string, documentId: string) {
    const document = await this.findOne(projectId, documentId);

    await this.prisma.projectDocument.delete({
      where: { id: document.id },
    });

    return document;
  }
}
