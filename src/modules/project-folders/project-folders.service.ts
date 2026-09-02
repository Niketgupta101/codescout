import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DocumentStatus, Prisma } from "@prisma/client";
import type { ProjectFolder } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { EnvService } from "../env/env.service";
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

  // guards the scheduled sweep against overlapping itself; see _handleProjectFolderSync
  isSyncing = false;

  constructor(
    readonly prisma: PrismaService,
    readonly projectDocumentService: ProjectDocumentService,
    readonly markitdownService: MarkitdownService,
    readonly googleDriveService: GoogleDriveService,
    readonly projectReconcileService: ProjectReconcileService,
    readonly envService: EnvService,
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

    this.logger.log(`Importing ${files.length} drive files for project ${projectFolder.projectId}`);

    const issues: ProjectFolderImportIssue[] = [];
    let documentsChanged = 0;

    for (const [index, file] of files.entries()) {
      // skip unsupported files
      const isSupported =
        this.markitdownService.isSupportedMimeType(file.mimeType) ||
        this.markitdownService.isSupportedExtension(file.name);

      if (!isSupported) {
        issues.push({ path: file.path, status: "skipped", reason: "unsupported file type" });
        continue;
      }

      const heartbeat = `[${index + 1}/${files.length}] ${file.path}`;

      // matched project-wide rather than per folder, so a file that moved between folders is recognized as the
      // document it already is. aliases match too, so a duplicate upload resolves to the document holding its content
      const projectDocument = await this.prisma.projectDocument.findFirst({
        where: { projectId: projectFolder.projectId, providerExternalIds: { has: file.id } },
      });

      if (projectDocument) {
        // a moved or renamed file keeps its drive id, so follow it here instead of importing a second copy
        if (projectDocument.projectFolderId !== projectFolder.id || projectDocument.path !== file.path) {
          this.logger.log(`${heartbeat} moved, reattaching to this folder`);

          await this.prisma.projectDocument.update({
            where: { id: projectDocument.id },
            data: { projectFolderId: projectFolder.id, path: file.path },
          });
        }

        // skip re-import when the file has not changed since the last successful one; a document left pending or
        // failed is retried, which is what makes a forced re-import unnecessary
        const isUnchanged =
          projectDocument.status === DocumentStatus.completed &&
          !!projectDocument.providerExternalModifiedAt &&
          !!file.modifiedAt &&
          projectDocument.providerExternalModifiedAt.getTime() >= file.modifiedAt.getTime();

        if (isUnchanged) {
          this.logger.log(`${heartbeat} unchanged, skipping`);
          continue;
        }

        this.logger.log(`${heartbeat} re-importing`);

        try {
          await this.projectDocumentService.importProjectDocument(projectDocument);
          documentsChanged++;
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
          documentsChanged++;
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

    if (documentsChanged > 0) {
      try {
        this.logger.log(`Canonicalizing project ${projectFolder.projectId} after import`);
        await this.projectReconcileService.canonicalize(projectFolder.projectId);
      } catch (error) {
        // importing source documents succeeds independently; this retryable enrichment must not mask it
        this.logger.error(`Failed to canonicalize project ${projectFolder.projectId} after import`, error);
      }
    }

    this.logger.log(
      `Project folder import completed with ${documentsChanged} changed document(s) for project ${projectFolder.projectId}`,
    );

    return { projectFolderId: projectFolder.id, documentsChanged, issues };
  }

  /**
   * Polls every linked folder and imports what changed since its last sync.
   * A folder whose files are untouched costs one drive listing and no inference, so the schedule stays cheap.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async _handleProjectFolderSync() {
    if (!this.envService.get("PROJECT_FOLDER_SYNC_ENABLED", false)) {
      return;
    }

    // an import of a folder with many new documents can outrun the interval, so let the run in flight finish
    // rather than starting a second pass over the same folders
    if (this.isSyncing) {
      this.logger.warn("Skipping scheduled folder sync, the previous run is still in progress");

      return;
    }

    this.isSyncing = true;

    try {
      const projectFolders = await this.prisma.projectFolder.findMany({ orderBy: { lastSyncedAt: "asc" } });

      this.logger.log(`Scheduled sync starting for ${projectFolders.length} folder(s)`);

      let documentsChanged = 0;

      // sequential so one sweep cannot fan out into concurrent drive downloads and extraction across every project
      for (const projectFolder of projectFolders) {
        try {
          const result = await this.importProjectFolder(projectFolder.id);
          documentsChanged += result.documentsChanged;
        } catch (error) {
          // one unreachable or unshared folder must not stop the folders behind it in the sweep
          this.logger.error(`Scheduled sync failed for folder ${projectFolder.id}`, error);
        }
      }

      this.logger.log(`Scheduled sync complete, ${documentsChanged} document(s) changed`);
    } finally {
      this.isSyncing = false;
    }
  }
}
