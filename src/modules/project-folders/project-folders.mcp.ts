import { Injectable, Logger } from "@nestjs/common";
import { Tool, type Context } from "@rekog/mcp-nest";
import { McpActorService } from "src/modules/mcp/mcp-actor.service";
import { McpToolRequest } from "src/modules/mcp/types/mcp-tool-request.type";
import { ProjectFolderService } from "./project-folders.service";
import { ProjectReconcileService } from "src/modules/project-reconcile/project-reconcile.service";
import { ProjectDocumentService } from "src/modules/project-document/project-document.service";
import {
  ProjectFolderCreateSchema,
  ProjectFolderCreateInput,
} from "./dtos/project-folder-create.schema";
import {
  ProjectFolderImportSchema,
  ProjectFolderImportInput,
} from "./dtos/project-folder-import.schema";
import { GoogleDriveService } from "../google-drive/google-drive.service";
import { z } from "zod";

@Injectable()
export class ProjectFolderMcp {
  readonly logger = new Logger(ProjectFolderMcp.name);

  constructor(
    readonly projectFolderService: ProjectFolderService,
    readonly projectReconcileService: ProjectReconcileService,
    readonly projectDocumentService: ProjectDocumentService,
    readonly mcpActorService: McpActorService,
    readonly googleDriveService: GoogleDriveService,
  ) {}

  /**
   * Links a Google Drive folder to a project by creating a folder entry.
   * The service account email is returned so the user knows who needs access.
   */
  @Tool({
    name: "projectFolderCreate",
    description:
      "Links a Google Drive folder to a project. Creates a folder entry that can later be imported. " +
      "You must share the Drive folder with the service account email returned in the response before importing.",
    parameters: ProjectFolderCreateSchema,
  })
  async projectFolderCreate(
    input: ProjectFolderCreateInput,
    _context: Context,
    request?: McpToolRequest,
  ) {
    const actor = await this.mcpActorService.actorResolve(request);

    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: input.projectId,
      actor,
    });

    const serviceAccountEmail = this.googleDriveService.getServiceAccountEmail();

    const folder = await this.projectFolderService.create({
      projectId: project.id,
      createProjectFolderDto: {
        name: input.name,
        provider: "googleDrive",
        providerId: input.providerId,
      },
    });

    return {
      projectFolderId: folder.id,
      serviceAccountEmail,
      message: `Folder linked to project. Share the Google Drive folder with ${serviceAccountEmail} to grant access, then call projectFolderImport.`,
    };
  }

  @Tool({
    name: "projectActionItemResolve",
    description:
      "Resolves canonical action-item statuses from the project's documents. An item is marked done only when a " +
      "later statement decisively says that exact deliverable was completed, cited with a verbatim quote that is " +
      "checked mechanically; anything ambiguous, and anything with both supporting and contradicting evidence, is " +
      "left as extraction found it. Never sets any status other than done. " +
      "Run dryRun first to review what would change without writing. Safe to re-run: an item whose evidence has " +
      "not changed since the last run is skipped without an LLM call, so repeat runs are nearly free.",
    parameters: z.object({
      projectId: z.uuid().describe("Project UUID whose action items should be resolved."),
      dryRun: z
        .boolean()
        .optional()
        .describe("Return the proposed changes without writing them. Use this before the first real run."),
      force: z
        .boolean()
        .optional()
        .describe("Re-judge every item even when its evidence is unchanged. Use after changing resolution logic."),
    }),
  })
  async projectActionItemResolve(
    projectActionItemResolveInput: { projectId: string; dryRun?: boolean; force?: boolean },
    _context: Context,
    request?: McpToolRequest,
  ) {
    const actor = await this.mcpActorService.actorResolve(request);

    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: projectActionItemResolveInput.projectId,
      actor,
    });

    this.logger.log(
      `MCP projectActionItemResolve: project=${project.id} dryRun=${projectActionItemResolveInput.dryRun ?? false}`,
    );

    const result = await this.projectReconcileService.resolveActionItemStatuses(project.id, {
      dryRun: projectActionItemResolveInput.dryRun,
      force: projectActionItemResolveInput.force,
    });

    // only the items this run actually changed are worth returning; unchanged ones would bury them
    const changed = result.proposals.filter(
      (proposal) => proposal.status !== proposal.previousStatus || proposal.statusSource !== proposal.previousStatusSource,
    );

    return { projectId: project.id, ...result, proposals: changed };
  }

  @Tool({
    name: "projectFolderDelete",
    description:
      "Removes a Google Drive folder link from a project. Documents already imported through the link are kept - " +
      "they are unlinked, not deleted, so their extracted statements, topics and action items survive, and a later " +
      "import that covers the same files reattaches them without re-extracting. " +
      "Use this when a link is superseded, for example after linking a parent folder that already covers it.",
    parameters: z.object({
      projectId: z.uuid().describe("Project UUID owning the folder link."),
      projectFolderId: z.uuid().describe("Folder link UUID to remove."),
    }),
  })
  async projectFolderDelete(
    projectFolderDeleteInput: { projectId: string; projectFolderId: string },
    _context: Context,
    request?: McpToolRequest,
  ) {
    const actor = await this.mcpActorService.actorResolve(request);

    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: projectFolderDeleteInput.projectId,
      actor,
    });

    const projectFolder = await this.projectFolderService.projectFolderDelete({
      projectId: project.id,
      projectFolderId: projectFolderDeleteInput.projectFolderId,
    });

    return {
      projectFolderId: projectFolder.id,
      message: `Folder link "${projectFolder.name}" removed. Documents imported through it were kept and unlinked.`,
    };
  }

  @Tool({
    name: "projectFolderImport",
    description:
      "Starts importing files from a linked Google Drive folder into the project's knowledge base. " +
      "Returns immediately with a projectFolderImportId - the import runs in the background, since a large " +
      "folder takes far longer than one request. Poll projectFolderImportStatus with that id to follow progress " +
      "and see per-file issues. Requires that the folder has been shared with the service account email shown " +
      "during projectFolderCreate. Safe to re-run: files that have not changed since the last import are skipped.",
    parameters: ProjectFolderImportSchema,
  })
  async projectFolderImport(
    projectFolderImportInput: ProjectFolderImportInput,
    _context: Context,
    request?: McpToolRequest,
  ) {
    const actor = await this.mcpActorService.actorResolve(request);

    await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: projectFolderImportInput.projectId,
      actor,
    });

    try {
      const projectFolderImport = await this.projectFolderService.projectFolderImportStart(
        projectFolderImportInput.projectFolderId,
      );

      return {
        projectFolderImportId: projectFolderImport.id,
        status: projectFolderImport.status,
        message: `Import started in the background. Poll projectFolderImportStatus with projectFolderImportId ${projectFolderImport.id} to follow progress.`,
      };
    } catch (error) {
      const serviceAccountEmail = this.googleDriveService.getServiceAccountEmail();
      this.logger.error("Failed to start project folder import", error);

      return {
        success: false,
        error: String(error),
        serviceAccountEmail,
        message: `Could not start the import. If the folder is not reachable, ensure it has been shared with ${serviceAccountEmail} (Viewer access is required).`,
      };
    }
  }

  @Tool({
    name: "projectFolderImportStatus",
    description:
      "Reports the progress and outcome of a background folder import started by projectFolderImport. " +
      "Returns status (running, completed, failed), how many files have been processed out of the total, " +
      "how many documents changed, the file currently being processed, and any per-file issues. " +
      "A failed or interrupted import can simply be re-run - already-imported files are skipped.",
    parameters: z.object({
      projectId: z.uuid().describe("Project UUID owning the import."),
      projectFolderImportId: z.uuid().describe("Import UUID returned by projectFolderImport."),
    }),
  })
  async projectFolderImportStatus(
    projectFolderImportStatusInput: { projectId: string; projectFolderImportId: string },
    _context: Context,
    request?: McpToolRequest,
  ) {
    const actor = await this.mcpActorService.actorResolve(request);

    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: projectFolderImportStatusInput.projectId,
      actor,
    });

    return this.projectFolderService.projectFolderImportFindOne({
      projectId: project.id,
      projectFolderImportId: projectFolderImportStatusInput.projectFolderImportId,
    });
  }

  /**
   * Triggers reconciliation for a project.
   * This processes imported documents and builds/updates the project's knowledge graph.
   */
  @Tool({
    name: "projectReconcile",
    description:
      "Triggers reconciliation for a project. Processes all imported documents, " +
      "extracts statements and action items, and updates the project's knowledge graph. " +
      "This may take a while depending on the number of imported documents.",
    parameters: z.object({
      projectId: z
        .uuid()
        .describe("Project UUID to reconcile."),
    }),
  })
  async projectReconcile(
    input: { projectId: string },
    _context: Context,
    request?: McpToolRequest,
  ) {
    const actor = await this.mcpActorService.actorResolve(request);

    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: input.projectId,
      actor,
    });

    this.logger.log(`MCP projectReconcile: project=${project.id}`);

    const result = await this.projectReconcileService.canonicalize(project.id);

    return { projectId: project.id, ...result };
  }

  /**
   * Threads a project's statements into supersession chains and recomputes bi-temporal validity.
   * Safe to re-run: every statement's state is recomputed from the extraction layer each pass.
   */
  @Tool({
    name: "projectStatementThread",
    description:
      "Threads a project's statements into supersession chains: detects which statements replace earlier ones, " +
      "links them, and recomputes each statement's validity window and decision/implementation status. " +
      "Run after projectReconcile. Safe to re-run - each pass recomputes the whole graph from the extracted " +
      "statements, so improved threading logic can be applied without re-indexing documents.",
    parameters: z.object({
      projectId: z.uuid().describe("Project UUID whose statements should be threaded."),
    }),
  })
  async projectStatementThread(
    projectStatementThreadInput: { projectId: string },
    _context: Context,
    request?: McpToolRequest,
  ) {
    const actor = await this.mcpActorService.actorResolve(request);

    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: projectStatementThreadInput.projectId,
      actor,
    });

    this.logger.log(`MCP projectStatementThread: project=${project.id}`);

    const result = await this.projectReconcileService.threadStatements(project.id);

    return { projectId: project.id, ...result };
  }

  /**
   * Creates a document manually with raw content, then indexes and classifies it.
   * Useful for content generated on-the-fly by an LLM (e.g., email extracted via another tool).
   */
  @Tool({
    name: "projectDocumentCreate",
    description:
      "Creates a project document from raw text content. The document is immediately indexed, " +
      "classified, and processed for statement/action-item extraction. " +
      "Use this when you have content that isn't coming from a Google Drive file — " +
      "for example, text generated from an email, a web scrape, or LLM synthesis.",
    parameters: z.object({
      projectId: z.uuid().describe("Project UUID to attach the document to."),
      name: z.string().min(1).describe("Display name / filename for the document."),
      content: z.string().min(1).describe("Raw text/markdown content of the document."),
      occurredAt: z
        .string()
        .datetime({ offset: true })
        .optional()
        .describe(
          "When this document's content is from (e.g., email sent date). " +
            "Defaults to creation time if omitted.",
        ),
    }),
  })
  async projectDocumentCreate(
    input: {
      projectId: string;
      name: string;
      content: string;
      occurredAt?: string;
    },
    _context: Context,
    request?: McpToolRequest,
  ) {
    const actor = await this.mcpActorService.actorResolve(request);

    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: input.projectId,
      actor,
    });

    const document = await this.projectDocumentService.createManual({
      projectId: project.id,
      name: input.name,
      content: input.content,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
    });

    return {
      projectDocumentId: document.id,
      projectId: project.id,
      message: `Document created and indexed. Run projectReconcile to process it into the knowledge graph.`,
    };
  }
}
