import { Injectable, Logger } from "@nestjs/common";
import { Tool, type Context } from "@rekog/mcp-nest";
import { AgentToolsService } from "src/modules/agent/agent-tools.service";
import { McpActorService } from "src/modules/mcp/mcp-actor.service";
import { McpToolRequest } from "src/modules/mcp/types/mcp-tool-request.type";
import { ProjectCreateInput, ProjectCreateSchema } from "./dto/project-create.schema";
import { ProjectFileTreeGetInput, ProjectFileTreeGetSchema } from "./dto/project-file-tree-get.schema";
import { ProjectGetInput, ProjectGetSchema } from "./dto/project-get.schema";
import { ProjectListInput, ProjectListSchema } from "./dto/project-list.schema";
import { ProjectStatsGetInput, ProjectStatsGetSchema } from "./dto/project-stats-get.schema";
import { ProjectService } from "./projects.service";

@Injectable()
export class ProjectsMcp {
  readonly logger = new Logger(ProjectsMcp.name);

  constructor(
    readonly projectService: ProjectService,
    readonly agentToolsService: AgentToolsService,
    readonly mcpActorService: McpActorService,
  ) {}

  @Tool({
    name: "projectList",
    description:
      "List all projects the authenticated user can access. " +
      "Use this as the entry point to discover projectIds for other tools.",
    parameters: ProjectListSchema,
  })
  async projectList(_projectListInput: ProjectListInput, _context: Context, request?: McpToolRequest) {
    await this.mcpActorService.actorResolve(request);

    return this.projectService.findAll();
  }

  @Tool({
    name: "projectGet",
    description:
      "Get a single project's details (name, description, timestamps). " +
      "Use this to confirm context before asking questions or starting an indexing job.",
    parameters: ProjectGetSchema,
  })
  async projectGet(projectGetInput: ProjectGetInput, _context: Context, request?: McpToolRequest) {
    const actor = await this.mcpActorService.actorResolve(request);
    const projectAccessChecked = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: projectGetInput.projectId,
      gitRemoteUrl: projectGetInput.gitRemoteUrl,
      actor,
    });

    return this.projectService.findOne(projectAccessChecked.id);
  }

  @Tool({
    name: "projectCreate",
    description:
      "Create a new project. The name must be unique. " +
      "After creation, use repositoryIndex to index a GitHub repository into the project.",
    parameters: ProjectCreateSchema,
  })
  async projectCreate(projectCreateInput: ProjectCreateInput, _context: Context, request?: McpToolRequest) {
    await this.mcpActorService.actorResolve(request);
    this.logger.log(`MCP projectCreate: name=${projectCreateInput.name}`);

    return this.projectService.create({
      name: projectCreateInput.name,
      description: projectCreateInput.description,
    });
  }

  @Tool({
    name: "projectStatsGet",
    description:
      "Get indexing statistics for a project: total files, files by language, total symbols, symbols by type. " +
      "Use this for a quick 'how big is this codebase' answer without burning tool budget on file reads.",
    parameters: ProjectStatsGetSchema,
  })
  async projectStatsGet(
    projectStatsGetInput: ProjectStatsGetInput,
    _context: Context,
    request?: McpToolRequest,
  ) {
    const actor = await this.mcpActorService.actorResolve(request);
    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: projectStatsGetInput.projectId,
      gitRemoteUrl: projectStatsGetInput.gitRemoteUrl,
      actor,
    });

    return this.agentToolsService.getStats(project.id);
  }

  @Tool({
    name: "projectFileTreeGet",
    description:
      "Get the directory and file structure of an indexed project as a tree. " +
      "Use this to understand the project layout before drilling into specific files.",
    parameters: ProjectFileTreeGetSchema,
  })
  async projectFileTreeGet(
    projectFileTreeGetInput: ProjectFileTreeGetInput,
    _context: Context,
    request?: McpToolRequest,
  ) {
    const actor = await this.mcpActorService.actorResolve(request);
    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: projectFileTreeGetInput.projectId,
      gitRemoteUrl: projectFileTreeGetInput.gitRemoteUrl,
      actor,
    });

    return this.agentToolsService.getFileTree(project.id);
  }
}
