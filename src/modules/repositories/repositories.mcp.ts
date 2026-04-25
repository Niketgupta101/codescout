import { Injectable, Logger } from "@nestjs/common";
import { Tool, type Context } from "@rekog/mcp-nest";
import { IndexingCostService } from "src/modules/indexing/indexing-cost.service";
import { McpActorService } from "src/modules/mcp/mcp-actor.service";
import { McpToolRequest } from "src/modules/mcp/types/mcp-tool-request.type";
import {
  RepositoryIndexCostEstimateInput,
  RepositoryIndexCostEstimateSchema,
} from "./dto/repository-index-cost-estimate.schema";
import { RepositoryIndexInput, RepositoryIndexSchema } from "./dto/repository-index.schema";
import { RepositoryListInput, RepositoryListSchema } from "./dto/repository-list.schema";
import { RepositoryStatusGetInput, RepositoryStatusGetSchema } from "./dto/repository-status-get.schema";
import { RepositoriesService } from "./repositories.service";

@Injectable()
export class RepositoriesMcp {
  readonly logger = new Logger(RepositoriesMcp.name);

  constructor(
    readonly repositoriesService: RepositoriesService,
    readonly indexingCostService: IndexingCostService,
    readonly mcpActorService: McpActorService,
  ) {}

  @Tool({
    name: "repositoryList",
    description:
      "List all repositories indexed into a project, with their status and metadata. " +
      "Use this to find a repositoryId for repositoryStatusGet.",
    parameters: RepositoryListSchema,
  })
  async repositoryList(repositoryListInput: RepositoryListInput, _context: Context, request?: McpToolRequest) {
    const actor = await this.mcpActorService.actorResolve(request);
    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: repositoryListInput.projectId,
      gitRemoteUrl: repositoryListInput.gitRemoteUrl,
      actor,
    });

    return this.repositoriesService.findAll(project.id);
  }

  @Tool({
    name: "repositoryIndex",
    description:
      "Clone a GitHub repository and index it into a project. " +
      "Returns the repositoryId immediately; indexing runs asynchronously. " +
      "Poll repositoryStatusGet to track progress through cloning, indexing, and completion.",
    parameters: RepositoryIndexSchema,
  })
  async repositoryIndex(repositoryIndexInput: RepositoryIndexInput, _context: Context, request?: McpToolRequest) {
    const actor = await this.mcpActorService.actorResolve(request);
    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: repositoryIndexInput.projectId,
      gitRemoteUrl: repositoryIndexInput.gitRemoteUrl,
      actor,
    });

    this.logger.log(`MCP repositoryIndex: project=${project.id} url=${repositoryIndexInput.url}`);

    return this.repositoriesService.index(project.id, {
      url: repositoryIndexInput.url,
      branch: repositoryIndexInput.branch,
      repositoryType: repositoryIndexInput.repositoryType,
      includeTests: repositoryIndexInput.includeTests,
      authToken: repositoryIndexInput.authToken,
    });
  }

  @Tool({
    name: "repositoryIndexCostEstimate",
    description:
      "Estimate the OpenAI cost of indexing a repository before committing to it. " +
      "Clones the repo and tokenizes files locally — no DB writes, no LLM calls. " +
      "Returns total files, token counts, and USD cost broken down by component. " +
      "Use this before repositoryIndex on any repo where cost is a concern.",
    parameters: RepositoryIndexCostEstimateSchema,
  })
  async repositoryIndexCostEstimate(
    repositoryIndexCostEstimateInput: RepositoryIndexCostEstimateInput,
    _context: Context,
    request?: McpToolRequest,
  ) {
    await this.mcpActorService.actorResolve(request);

    this.logger.log(`MCP repositoryIndexCostEstimate: url=${repositoryIndexCostEstimateInput.url}`);

    return this.indexingCostService.repositoryIndexCostEstimate(repositoryIndexCostEstimateInput);
  }

  @Tool({
    name: "repositoryStatusGet",
    description:
      "Get the current indexing status and metadata for a repository. " +
      "Status values: pending, cloning, indexing, completed, failed. " +
      "Poll this after repositoryIndex until status is completed or failed.",
    parameters: RepositoryStatusGetSchema,
  })
  async repositoryStatusGet(
    repositoryStatusGetInput: RepositoryStatusGetInput,
    _context: Context,
    request?: McpToolRequest,
  ) {
    const actor = await this.mcpActorService.actorResolve(request);
    const repository = await this.repositoriesService.findOne(repositoryStatusGetInput.repositoryId);

    // verify the actor can access the repository's project
    await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: repository.projectId,
      actor,
    });

    return repository;
  }
}
