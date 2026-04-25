import { Injectable, Logger } from "@nestjs/common";
import { Tool, type Context } from "@rekog/mcp-nest";
import { McpActorService } from "src/modules/mcp/mcp-actor.service";
import { McpToolRequest } from "src/modules/mcp/types/mcp-tool-request.type";
import { AgentToolsService } from "./agent-tools.service";
import { CodeFileReadInput, CodeFileReadSchema } from "./dto/code-file-read.schema";
import { CodeFileSearchInput, CodeFileSearchSchema } from "./dto/code-file-search.schema";
import { SymbolSearchInput, SymbolSearchSchema } from "./dto/symbol-search.schema";

@Injectable()
export class AgentMcp {
  readonly logger = new Logger(AgentMcp.name);

  constructor(
    readonly agentToolsService: AgentToolsService,
    readonly mcpActorService: McpActorService,
  ) {}

  @Tool({
    name: "codeFileSearch",
    description:
      "Find files in a project by semantic similarity to a natural-language query. " +
      "Searches over file summaries, not raw content — best for 'which file handles X' questions. " +
      "Returns ranked file paths with summaries. Read individual files via codeFileRead.",
    parameters: CodeFileSearchSchema,
  })
  async codeFileSearch(codeFileSearchInput: CodeFileSearchInput, _context: Context, request?: McpToolRequest) {
    const actor = await this.mcpActorService.actorResolve(request);
    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: codeFileSearchInput.projectId,
      gitRemoteUrl: codeFileSearchInput.gitRemoteUrl,
      actor,
    });

    return this.agentToolsService.searchFiles(
      project.id,
      codeFileSearchInput.query,
      codeFileSearchInput.documentTypes,
      codeFileSearchInput.topK,
    );
  }

  @Tool({
    name: "codeFileRead",
    description:
      "Read the full raw content of a single file by its path. " +
      "Use this after codeFileSearch to inspect a specific file. " +
      "For broader questions about a codebase, prefer chatMessageCreate which orchestrates multiple reads.",
    parameters: CodeFileReadSchema,
  })
  async codeFileRead(codeFileReadInput: CodeFileReadInput, _context: Context, request?: McpToolRequest) {
    const actor = await this.mcpActorService.actorResolve(request);
    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: codeFileReadInput.projectId,
      gitRemoteUrl: codeFileReadInput.gitRemoteUrl,
      actor,
    });

    return this.agentToolsService.readFile(project.id, codeFileReadInput.filePath);
  }

  @Tool({
    name: "symbolSearch",
    description:
      "Find symbols (classes, functions, types, etc.) by name across an indexed project. " +
      "Returns symbol name, kind, and the file it lives in. " +
      "Use this for fast lookup when you already know a symbol name; for discovery use codeFileSearch or chatMessageCreate.",
    parameters: SymbolSearchSchema,
  })
  async symbolSearch(symbolSearchInput: SymbolSearchInput, _context: Context, request?: McpToolRequest) {
    const actor = await this.mcpActorService.actorResolve(request);
    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: symbolSearchInput.projectId,
      gitRemoteUrl: symbolSearchInput.gitRemoteUrl,
      actor,
    });

    return this.agentToolsService.searchSymbols(project.id, {
      name: symbolSearchInput.name,
      type: symbolSearchInput.type,
    });
  }
}
