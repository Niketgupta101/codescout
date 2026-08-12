import { Injectable, Logger } from "@nestjs/common";
import { Tool, type Context } from "@rekog/mcp-nest";
import { Prisma } from "@prisma/client";
import { McpActorService } from "src/modules/mcp/mcp-actor.service";
import { McpToolRequest } from "src/modules/mcp/types/mcp-tool-request.type";
import { ProjectBrainService } from "./project-brain.service";
import { ProjectActionItemListInput, ProjectActionItemListSchema } from "./dto/project-action-item-list.schema";
import { ProjectTopicListInput, ProjectTopicListSchema } from "./dto/project-topic-list.schema";
import { ProjectStatementSearchInput, ProjectStatementSearchSchema } from "./dto/project-statement-search.schema";
import { ProjectReferenceListInput, ProjectReferenceListSchema } from "./dto/project-reference-list.schema";
import { ProjectActionItemUpdateInput, ProjectActionItemUpdateSchema } from "./dto/project-action-item-update.schema";
import { ProjectTopicCorrectInput, ProjectTopicCorrectSchema } from "./dto/project-topic-correct.schema";
import { ProjectStatementCorrectInput, ProjectStatementCorrectSchema } from "./dto/project-statement-correct.schema";
import { ProjectReferenceCorrectInput, ProjectReferenceCorrectSchema } from "./dto/project-reference-correct.schema";

@Injectable()
export class ProjectBrainMcp {
  readonly logger = new Logger(ProjectBrainMcp.name);

  constructor(
    readonly projectBrainService: ProjectBrainService,
    readonly mcpActorService: McpActorService,
  ) {}

  @Tool({
    name: "projectActionItemList",
    description:
      "List the project's canonical action items (deduped commitments), optionally filtered by status. " +
      "Use this to see open work and who owns it before drilling in or marking items done.",
    parameters: ProjectActionItemListSchema,
  })
  async projectActionItemList(
    projectActionItemListInput: ProjectActionItemListInput,
    _context: Context,
    request?: McpToolRequest,
  ) {
    const actor = await this.mcpActorService.actorResolve(request);
    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: projectActionItemListInput.projectId,
      gitRemoteUrl: projectActionItemListInput.gitRemoteUrl,
      actor,
    });

    return this.projectBrainService.actionItemList({
      projectId: project.id,
      status: projectActionItemListInput.status,
      owner: projectActionItemListInput.owner,
      topicId: projectActionItemListInput.topicId,
      stale: projectActionItemListInput.stale,
    });
  }

  @Tool({
    name: "projectTopicList",
    description:
      "List the project's canonical topics (name, type, summary). " +
      "Use this to understand what the project's documents are about at a glance.",
    parameters: ProjectTopicListSchema,
  })
  async projectTopicList(projectTopicListInput: ProjectTopicListInput, _context: Context, request?: McpToolRequest) {
    const actor = await this.mcpActorService.actorResolve(request);
    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: projectTopicListInput.projectId,
      gitRemoteUrl: projectTopicListInput.gitRemoteUrl,
      actor,
    });

    return this.projectBrainService.topicList({ projectId: project.id });
  }

  @Tool({
    name: "projectStatementSearch",
    description:
      "Semantic search over the project's extracted statements (facts, decisions, proposals). " +
      "Pass a natural-language query; returns the most relevant statements with their document ids.",
    parameters: ProjectStatementSearchSchema,
  })
  async projectStatementSearch(
    projectStatementSearchInput: ProjectStatementSearchInput,
    _context: Context,
    request?: McpToolRequest,
  ) {
    const actor = await this.mcpActorService.actorResolve(request);
    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: projectStatementSearchInput.projectId,
      gitRemoteUrl: projectStatementSearchInput.gitRemoteUrl,
      actor,
    });

    return this.projectBrainService.statementSearch({
      projectId: project.id,
      query: projectStatementSearchInput.query,
      type: projectStatementSearchInput.type,
      decisionStatus: projectStatementSearchInput.decisionStatus,
      implementationStatus: projectStatementSearchInput.implementationStatus,
      includeSuperseded: projectStatementSearchInput.includeSuperseded,
      limit: projectStatementSearchInput.limit,
    });
  }

  @Tool({
    name: "projectReferenceList",
    description:
      "List the project's references (things documents point to) and how each resolved (linked/contradicted/notFound). " +
      "Use this to find dangling or contradicted assumptions across documents.",
    parameters: ProjectReferenceListSchema,
  })
  async projectReferenceList(
    projectReferenceListInput: ProjectReferenceListInput,
    _context: Context,
    request?: McpToolRequest,
  ) {
    const actor = await this.mcpActorService.actorResolve(request);
    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: projectReferenceListInput.projectId,
      gitRemoteUrl: projectReferenceListInput.gitRemoteUrl,
      actor,
    });

    return this.projectBrainService.referenceList({
      projectId: project.id,
      resolution: projectReferenceListInput.resolution,
    });
  }

  @Tool({
    name: "projectActionItemUpdate",
    description:
      "Set a canonical action item's status as a human (e.g. mark it done). " +
      "This is authoritative: it is pinned and never overwritten by the automated status recompute.",
    parameters: ProjectActionItemUpdateSchema,
  })
  async projectActionItemUpdate(
    projectActionItemUpdateInput: ProjectActionItemUpdateInput,
    _context: Context,
    request?: McpToolRequest,
  ) {
    const actor = await this.mcpActorService.actorResolve(request);
    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: projectActionItemUpdateInput.projectId,
      gitRemoteUrl: projectActionItemUpdateInput.gitRemoteUrl,
      actor,
    });

    return this.projectBrainService.actionItemStatusSet({
      projectId: project.id,
      actionItemId: projectActionItemUpdateInput.actionItemId,
      status: projectActionItemUpdateInput.status,
      correctedByUserId: actor.id,
    });
  }

  @Tool({
    name: "projectTopicCorrect",
    description:
      "Rename or retype a canonical topic as a human. " +
      "The correction is pinned so topic canonicalization leaves it untouched.",
    parameters: ProjectTopicCorrectSchema,
  })
  async projectTopicCorrect(
    projectTopicCorrectInput: ProjectTopicCorrectInput,
    _context: Context,
    request?: McpToolRequest,
  ) {
    const actor = await this.mcpActorService.actorResolve(request);
    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: projectTopicCorrectInput.projectId,
      gitRemoteUrl: projectTopicCorrectInput.gitRemoteUrl,
      actor,
    });

    return this.projectBrainService.topicCorrect({
      projectId: project.id,
      topicId: projectTopicCorrectInput.topicId,
      name: projectTopicCorrectInput.name,
      type: projectTopicCorrectInput.type,
      correctedByUserId: actor.id,
    });
  }

  @Tool({
    name: "projectStatementCorrect",
    description:
      "Correct a statement as a human: edit its fields, or invalidate a wrong extraction. " +
      "The correction is durable - it is re-applied after the source document is re-extracted.",
    parameters: ProjectStatementCorrectSchema,
  })
  async projectStatementCorrect(
    projectStatementCorrectInput: ProjectStatementCorrectInput,
    _context: Context,
    request?: McpToolRequest,
  ) {
    const actor = await this.mcpActorService.actorResolve(request);
    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: projectStatementCorrectInput.projectId,
      gitRemoteUrl: projectStatementCorrectInput.gitRemoteUrl,
      actor,
    });

    return this.projectBrainService.statementCorrect({
      projectId: project.id,
      statementId: projectStatementCorrectInput.statementId,
      operation: projectStatementCorrectInput.operation,
      patch: (projectStatementCorrectInput.patch ?? {}) as Prisma.InputJsonValue,
      note: projectStatementCorrectInput.note,
      correctedByUserId: actor.id,
    });
  }

  @Tool({
    name: "projectReferenceCorrect",
    description:
      "Correct a reference as a human: set its resolution/target, or invalidate a wrong reference. " +
      "The correction is durable - it is re-applied after the source document is re-extracted.",
    parameters: ProjectReferenceCorrectSchema,
  })
  async projectReferenceCorrect(
    projectReferenceCorrectInput: ProjectReferenceCorrectInput,
    _context: Context,
    request?: McpToolRequest,
  ) {
    const actor = await this.mcpActorService.actorResolve(request);
    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: projectReferenceCorrectInput.projectId,
      gitRemoteUrl: projectReferenceCorrectInput.gitRemoteUrl,
      actor,
    });

    return this.projectBrainService.referenceCorrect({
      projectId: project.id,
      referenceId: projectReferenceCorrectInput.referenceId,
      operation: projectReferenceCorrectInput.operation,
      patch: (projectReferenceCorrectInput.patch ?? {}) as Prisma.InputJsonValue,
      note: projectReferenceCorrectInput.note,
      correctedByUserId: actor.id,
    });
  }
}
