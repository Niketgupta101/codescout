import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ProjectFolder } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { LocaleException } from "src/plugins/locale/nest/locale.exception";
import { ProjectDocumentService } from "../project-document/project-document.service";
import { MarkitdownService } from "../markitdown/markitdown.service";
import { GoogleDriveService } from "../google-drive/google-drive.service";
import type { CreateProjectFolderDto } from "./dtos/create-project-folder.dto";
import type { FindAllProjectFoldersDto } from "./dtos/find-all-project-folders.dto";
import type { ProjectFolderImportResult } from "./types/project-folder-import-result.type";
import type { ProjectFolderImportIssue } from "./types/project-folder-import-issue.type";

@Injectable()
export class ProjectFolderService {
  readonly logger = new Logger(ProjectFolderService.name);

  constructor(
    readonly prisma: PrismaService,
    readonly projectDocumentService: ProjectDocumentService,
    readonly markitdownService: MarkitdownService,
    readonly googleDriveService: GoogleDriveService,
  ) {}

  async create(createInput: { projectId: string; createProjectFolderDto: CreateProjectFolderDto }) {
    const { projectId, createProjectFolderDto } = createInput;

    return this.prisma.projectFolder.create({
      data: {
        projectId,
        name: createProjectFolderDto.name,
        provider: createProjectFolderDto.provider,
        providerId: createProjectFolderDto.providerId,
      },
    });
  }

  async findAll(projectId: string, findAllProjectFoldersDto: FindAllProjectFoldersDto) {
    const { provider, skip, take } = findAllProjectFoldersDto;

    const where: Prisma.ProjectFolderWhereInput = {
      projectId,
      ...(provider && { provider }),
    };

    const total = await this.prisma.projectFolder.count({ where });
    const items = await this.prisma.projectFolder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...(skip !== undefined && { skip }),
      ...(take !== undefined && { take }),
    });

    return { items, total };
  }

  async findOne(projectFolderId: string) {
    const projectFolder = await this.prisma.projectFolder.findUnique({ where: { id: projectFolderId } });

    if (!projectFolder) {
      throw LocaleException.notFound();
    }

    return projectFolder;
  }

  async remove(projectFolderId: string) {
    const projectFolder = await this.findOne(projectFolderId); // ensure resource exists
    await this.prisma.projectFolder.delete({ where: { id: projectFolderId } });

    return projectFolder;
  }

  async importProjectFolder(projectFolderId: string): Promise<ProjectFolderImportResult> {
    const projectFolder = await this.findOne(projectFolderId);

    // google drive is the only source supported
    if (projectFolder.provider === "googleDrive") {
      return this._googleDriveProjectFolderImport(projectFolder);
    } else {
      throw new Error(`Unsupported project folder provider: ${projectFolder.provider as string}`);
    }
  }

  // crawls a linked google drive folder, routing each supported file to create or re-import
  async _googleDriveProjectFolderImport(projectFolder: ProjectFolder): Promise<ProjectFolderImportResult> {
    const files = await this.googleDriveService.listFolderFiles({ folderId: projectFolder.providerId });

    const issues: ProjectFolderImportIssue[] = [];

    for (const file of files) {
      // skip unsupported files
      if (!this.markitdownService.isSupported(file.name)) {
        issues.push({ path: file.path, status: "skipped", reason: "unsupported file type" });
        continue;
      }

      const projectDocument = await this.prisma.projectDocument.findFirst({
        where: { projectId: projectFolder.projectId, providerExternalId: file.id },
      });

      if (projectDocument) {
        // skip re-import if project document is unchanged since last import
        if (
          !!projectDocument.providerExternalModifiedAt &&
          !!file.modifiedAt &&
          projectDocument.providerExternalModifiedAt.getTime() >= file.modifiedAt.getTime()
        ) {
          continue;
        }

        try {
          await this.projectDocumentService.importProjectDocument(projectDocument);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to re-import drive file ${file.path}`, error);

          issues.push({ path: file.path, status: "failed", reason });
        }
      } else {
        try {
          await this.projectDocumentService.create({
            projectId: projectFolder.projectId,
            projectFolderId: projectFolder.id,
            provider: "googleDrive",
            providerExternalId: file.id,
          });
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to import drive file ${file.path}`, error);

          issues.push({ path: file.path, status: "failed", reason });
        }
      }
    }

    await this.prisma.projectFolder.update({
      where: { id: projectFolder.id },
      data: { lastSyncedAt: new Date() },
    });

    return { projectFolderId: projectFolder.id, issues };
  }
}
