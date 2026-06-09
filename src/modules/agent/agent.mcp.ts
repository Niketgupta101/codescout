import { Injectable, Logger } from "@nestjs/common";
import { Tool, type Context } from "@rekog/mcp-nest";
import { McpActorService } from "src/modules/mcp/mcp-actor.service";
import { McpToolRequest } from "src/modules/mcp/types/mcp-tool-request.type";
import { AgentToolsService } from "./agent-tools.service";
import { CodeFileReadInput, CodeFileReadSchema } from "./dto/code-file-read.schema";
import { CodeFileReadRangeInput, CodeFileReadRangeSchema } from "./dto/code-file-read-range.schema";
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
      "Semantic search over file summaries (NOT raw content). Use only when the question is fuzzy/conceptual and you don't already know a symbol name or a path hint. " +
      "If you know a symbol name, use symbolSearch instead. If you know a path pattern, use list_files-style filters. " +
      "Pairs with codeFileRead, codeFileReadRange, and symbolSearch - load those tools together for code questions. " +
      "Cross-project: omit BOTH projectId and gitRemoteUrl to search across every project you have access to (use for 'do we have X in any project?' questions). Each hit includes projectId + projectName for drill-in.",
    parameters: CodeFileSearchSchema,
  })
  async codeFileSearch(codeFileSearchInput: CodeFileSearchInput, _context: Context, request?: McpToolRequest) {
    const actor = await this.mcpActorService.actorResolve(request);

    // cross-project mode: caller didn't specify a project, so search every readable project
    if (!codeFileSearchInput.projectId && !codeFileSearchInput.gitRemoteUrl) {
      return this.agentToolsService.searchFilesAcrossProjects(
        actor,
        codeFileSearchInput.query,
        codeFileSearchInput.documentTypes,
        codeFileSearchInput.topK,
      );
    }

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
      "Read the FULL content of a single file (entire file regardless of size). " +
      "Use for small files where you want everything: controllers, DTOs, type definitions, READMEs, module files (typically <500 lines). " +
      "DO NOT USE FOR large service/router files when you only want one function - that's wasteful. For those, pair symbolSearch with codeFileReadRange instead. " +
      "If codeFileReadRange isn't in your tool list yet, search for it now - it's the partner tool for this one.",
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
    name: "codeFileReadRange",
    description:
      "Read a specific line range from a file (1-indexed, inclusive). Returns only the requested lines, capped at 1500 lines per call. " +
      "PRIMARY TOOL for large files when paired with symbolSearch: if symbolSearch returned startLine/endLine for the symbol you want, call codeFileReadRange directly with those numbers - DO NOT call codeFileRead first on a large file. " +
      "Partner tools: symbolSearch (to get line ranges), codeFileRead (for whole files when small).",
    parameters: CodeFileReadRangeSchema,
  })
  async codeFileReadRange(codeFileReadRangeInput: CodeFileReadRangeInput, _context: Context, request?: McpToolRequest) {
    const actor = await this.mcpActorService.actorResolve(request);
    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: codeFileReadRangeInput.projectId,
      gitRemoteUrl: codeFileReadRangeInput.gitRemoteUrl,
      actor,
    });

    return this.agentToolsService.readFileRange(
      project.id,
      codeFileReadRangeInput.filePath,
      codeFileReadRangeInput.startLine,
      codeFileReadRangeInput.endLine,
    );
  }

  @Tool({
    name: "symbolSearch",
    description:
      "PRIMARY ENTRY POINT for any named symbol (function, class, method, type, enum). " +
      "Case-insensitive partial match. Returns projectId + projectName + name + type + file path + 1-indexed inclusive line range (startLine/endLine, when known). " +
      "The returned line range is meant to be passed straight to codeFileReadRange - that's the canonical pair (symbolSearch → codeFileReadRange). " +
      "Scope with pathPattern (e.g. 'order.service') when the same symbol name exists in many files. " +
      "Cross-project: omit BOTH projectId and gitRemoteUrl to discover the symbol across every project you have access to. " +
      "If codeFileReadRange isn't in your tool list yet, search for it now - it's the partner tool for this one.",
    parameters: SymbolSearchSchema,
  })
  async symbolSearch(symbolSearchInput: SymbolSearchInput, _context: Context, request?: McpToolRequest) {
    const actor = await this.mcpActorService.actorResolve(request);

    // cross-project mode: caller didn't specify a project, so search every readable project
    if (!symbolSearchInput.projectId && !symbolSearchInput.gitRemoteUrl) {
      return this.agentToolsService.searchSymbolsAcrossProjects(actor, {
        name: symbolSearchInput.name,
        type: symbolSearchInput.type,
        pathPattern: symbolSearchInput.pathPattern,
      });
    }

    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: symbolSearchInput.projectId,
      gitRemoteUrl: symbolSearchInput.gitRemoteUrl,
      actor,
    });

    return this.agentToolsService.searchSymbols(project.id, {
      name: symbolSearchInput.name,
      type: symbolSearchInput.type,
      pathPattern: symbolSearchInput.pathPattern,
    });
  }
}
