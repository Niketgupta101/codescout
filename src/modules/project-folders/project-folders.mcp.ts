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

  /**
   * Imports files from a linked Google Drive folder into the project.
   * Throws a clear error if the service account lacks access to the folder.
   */
  @Tool({
    name: "projectFolderImport",
    description:
      "Imports files from a linked Google Drive folder into the project's knowledge base. " +
      "Requires that the folder has been shared with the service account email shown during projectFolderCreate.",
    parameters: ProjectFolderImportSchema,
  })
  async projectFolderImport(
    input: ProjectFolderImportInput,
    _context: Context,
    request?: McpToolRequest,
  ) {
    const actor = await this.mcpActorService.actorResolve(request);

    await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: input.projectId,
      actor,
    });

    try {
      return await this.projectFolderService.importProjectFolder(input.projectFolderId);
    } catch (error) {
      const serviceAccountEmail = this.googleDriveService.getServiceAccountEmail();
      this.logger.error("Failed to import project folder", error);

      return {
        success: false,
        error: String(error),
        serviceAccountEmail,
        message: `Import failed. Ensure the Google Drive folder has been shared with ${serviceAccountEmail} (Viewer access is required).`,
      };
    }
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
