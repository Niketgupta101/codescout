import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ProjectFolder } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { LocaleException } from "src/plugins/locale/nest/locale.exception";
import { ProjectDocumentService } from "../project-document/project-document.service";
import { MarkitdownService } from "../markitdown/markitdown.service";
import { GoogleDriveService } from "../google-drive/google-drive.service";
import { ProjectReconcileService } from "../project-reconcile/project-reconcile.service";
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
    readonly projectReconcileService: ProjectReconcileService,
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

  async importProjectFolder(projectFolderId: string, force = false): Promise<ProjectFolderImportResult> {
    const projectFolder = await this.findOne(projectFolderId);

    // google drive is the only source supported
    if (projectFolder.provider === "googleDrive") {
      return this._googleDriveProjectFolderImport(projectFolder, force);
    } else {
      throw new Error(`Unsupported project folder provider: ${projectFolder.provider as string}`);
    }
  }

  // crawls a linked google drive folder, routing each supported file to create or re-import
  async _googleDriveProjectFolderImport(projectFolder: ProjectFolder, force: boolean): Promise<ProjectFolderImportResult> {
    const files = await this.googleDriveService.listFolderFiles({ folderId: projectFolder.providerId });

    this.logger.log(`Importing ${files.length} drive files for project ${projectFolder.projectId}`);

    const issues: ProjectFolderImportIssue[] = [];

    for (const [index, file] of files.entries()) {
      // skip unsupported files
      if (!this.markitdownService.isSupported(file.name)) {
        issues.push({ path: file.path, status: "skipped", reason: "unsupported file type" });
        continue;
      }

      const heartbeat = `[${index + 1}/${files.length}] ${file.path}`;

      const projectDocument = await this.prisma.projectDocument.findFirst({
        where: { projectId: projectFolder.projectId, providerExternalId: file.id },
      });

      if (projectDocument) {
        // skip re-import if unchanged since last import, unless a forced re-import was requested
        const isUnchanged =
          !!projectDocument.providerExternalModifiedAt &&
          !!file.modifiedAt &&
          projectDocument.providerExternalModifiedAt.getTime() >= file.modifiedAt.getTime();

        if (isUnchanged && !force) {
          this.logger.log(`${heartbeat} unchanged, skipping`);
          continue;
        }

        this.logger.log(`${heartbeat} re-importing`);

        try {
          await this.projectDocumentService.importProjectDocument(projectDocument);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to re-import drive file ${file.path}`, error);

          issues.push({ path: file.path, status: "failed", reason });
        }
      } else {
        this.logger.log(`${heartbeat} importing`);

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

    // reconcile the project's relational layer once all documents in this sync are extracted
    try {
      this.logger.log(`All files processed, reconciling project ${projectFolder.projectId}`);
      await this.projectReconcileService.reconcile(projectFolder.projectId);
    } catch (error) {
      this.logger.error(`Failed to reconcile project ${projectFolder.projectId} after import`, error);
    }

    return { projectFolderId: projectFolder.id, issues };
  }
}
