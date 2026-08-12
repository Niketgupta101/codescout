import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { OpenAIService } from "../openai/openai.service";
import type { Actor } from "../actor/types/actor.type";
import type { ToolResult } from "./types/tool-result.type";
import type { FileInfo } from "./types/file-info.type";
import type { SymbolInfo } from "./types/symbol-info.type";
import type { DirectoryNode } from "./types/directory-node.type";
import type { FileSearchResult } from "./types/file-search-result.type";
import type { AgentToolReadFileResult } from "./types/agent-tool-read-file-result.type";
import type { AgentToolCodeMatch } from "./types/agent-tool-code-match.type";
import type { DirectoryDetail } from "./types/directory-detail.type";
import { AgentToolListFileDto } from "./dtos/agent-tool-list-file.dto";
import { AgentToolSearchSymbol } from "./dtos/agent-tool-search-symbol.dto";
import { AgentToolSearchCodeDto } from "./dtos/agent-tool-search-code.dto";

// safety cap on the number of lines a single read returns, applied to both readFile (whole-file) and readFileRange (specific span)
// chosen to be generous enough that typical service files (200-1500 lines) fit unclipped, while bounding pathological cases (giant generated files)
const MAX_READ_FILE_LINES = 1500;

// cap project summary length when attached per-hit in cross-project search results
// the system prompt's project_context block uses a separate (larger) cap because there's just one project there
const PROJECT_SUMMARY_PER_HIT_CHARS = 240;

const truncateProjectSummary = (summary: string | null | undefined): string | undefined => {
  if (!summary) {
    return undefined;
  }
  if (summary.length <= PROJECT_SUMMARY_PER_HIT_CHARS) {
    return summary;
  }
  return summary.slice(0, PROJECT_SUMMARY_PER_HIT_CHARS).trimEnd() + "…";
};

@Injectable()
export class AgentToolsService {
  readonly logger = new Logger(AgentToolsService.name);

  constructor(
    readonly prisma: PrismaService,
    readonly openaiService: OpenAIService,
  ) {}

  async listFiles(projectId: string, { pathPattern }: AgentToolListFileDto): Promise<ToolResult<FileInfo[]>> {
    try {
      this.logger.debug(`listFiles(pathPattern=${pathPattern ?? ""})`);

      // case-insensitive substring match on fullPath; `*` is stripped so callers passing glob-like patterns still work
      const substring = pathPattern?.replace(/\*/g, "").trim();

      const files = await this.prisma.repositoryFile.findMany({
        where: {
          projectId,
          ...(substring
            ? {
                fullPath: {
                  contains: substring,
                  mode: "insensitive",
                },
              }
            : {}),
        },
        orderBy: {
          fullPath: "asc",
        },
      });

      const fileInfos: FileInfo[] = files.map((file) => ({
        path: file.fullPath,
        language: file.language,
        lines: (file.metadata as { lines?: number })?.lines ?? 0,
        checksum: file.checksum ?? "",
      }));

      return {
        success: true,
        data: fileInfos,
      };
    } catch (error) {
      this.logger.error("Failed to list files", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async readFile(projectId: string, filePath: string): Promise<ToolResult<AgentToolReadFileResult>> {
    try {
      this.logger.debug(`readFile(path=${filePath})`);

      const file = await this.prisma.repositoryFile.findFirst({
        where: {
          projectId,
          fullPath: filePath,
        },
        select: {
          fullPath: true,
          language: true,
          rawContent: true,
          metadata: true,
        },
      });

      if (!file) {
        return {
          success: false,
          error: `File not found: ${filePath}`,
        };
      }

      // read_file returns the full file always; callers are expected to pick the right tool upfront - read_file for small files (DTOs, types, controllers), search_symbols + read_file_range for large ones (services, routers)
      const totalLines = file.rawContent.split("\n").length;

      return {
        success: true,
        data: {
          path: file.fullPath,
          language: file.language,
          content: file.rawContent,
          metadata: file.metadata,
          totalLines,
        },
      };
    } catch (error) {
      this.logger.error("Failed to read file", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async readFileRange(
    projectId: string,
    filePath: string,
    startLine: number,
    endLine: number,
  ): Promise<ToolResult<AgentToolReadFileResult>> {
    try {
      this.logger.debug(`readFileRange(path=${filePath}, lines=${startLine}-${endLine})`);

      // validate the requested range early - invalid input would silently produce empty or garbage output otherwise
      if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine) {
        return {
          success: false,
          error: `Invalid line range: startLine=${startLine}, endLine=${endLine}. Must satisfy 1 <= startLine <= endLine.`,
        };
      }

      const file = await this.prisma.repositoryFile.findFirst({
        where: {
          projectId,
          fullPath: filePath,
        },
        select: {
          fullPath: true,
          language: true,
          rawContent: true,
          metadata: true,
        },
      });

      if (!file) {
        return {
          success: false,
          error: `File not found: ${filePath}`,
        };
      }

      const allLines = file.rawContent.split("\n");
      const totalLines = allLines.length;

      // clamp end to file length - asking past EOF is fine, just return what exists
      // separately, cap the range size at MAX_READ_FILE_LINES so a single call can't pull arbitrarily large spans
      const clampedEnd = Math.min(endLine, totalLines);
      const cappedEnd = Math.min(clampedEnd, startLine + MAX_READ_FILE_LINES - 1);
      const truncated = cappedEnd < clampedEnd;

      const returnedLines = allLines.slice(startLine - 1, cappedEnd);
      let content = returnedLines.join("\n");

      if (truncated) {
        content += `\n\n[range capped at line ${cappedEnd} (${MAX_READ_FILE_LINES} max) - call read_file_range again with a later startLine to continue]`;
      }

      return {
        success: true,
        data: {
          path: file.fullPath,
          language: file.language,
          content,
          metadata: file.metadata,
          totalLines,
        },
      };
    } catch (error) {
      this.logger.error("Failed to read file range", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Search symbols by name and/or type
   * Examples: search_symbols("AuthService"), search_symbols("login", "function")
   */
  async searchSymbols(
    projectId: string,
    { name, type, pathPattern }: AgentToolSearchSymbol,
  ): Promise<ToolResult<SymbolInfo[]>> {
    try {
      this.logger.debug(`searchSymbols(name=${name}, type=${type ?? ""}, pathPattern=${pathPattern ?? ""})`);

      // strip glob-style wildcards from the path filter - fullPath uses a substring match, so wildcards aren't meaningful
      const pathSubstring = pathPattern?.replace(/\*/g, "").trim();

      const symbols = await this.prisma.repositoryFileSymbol.findMany({
        where: {
          projectId,
          name: {
            contains: name,
            mode: "insensitive",
          },
          ...(type ? { type: type } : {}),
          ...(pathSubstring
            ? {
                repositoryFile: {
                  fullPath: {
                    contains: pathSubstring,
                    mode: "insensitive",
                  },
                },
              }
            : {}),
        },
        include: {
          repositoryFile: {
            select: {
              fullPath: true,
              directory: { select: { summary: true } },
            },
          },
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        take: 50,
      });

      // single-project mode: do NOT attach projectSummary - it's already in the system prompt's project_context block
      const symbolInfos: SymbolInfo[] = symbols.map((symbol) => ({
        projectId: symbol.project.id,
        projectName: symbol.project.name,
        directorySummary: symbol.repositoryFile.directory?.summary ?? undefined,
        name: symbol.name,
        type: symbol.type,
        filePath: symbol.repositoryFile.fullPath,
        startLine: symbol.startLine ?? undefined,
        endLine: symbol.endLine ?? undefined,
      }));

      return {
        success: true,
        data: symbolInfos,
      };
    } catch (error) {
      this.logger.error("Failed to search symbols", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async searchCode(
    projectId: string,
    { pattern, language, pathPattern }: AgentToolSearchCodeDto,
  ): Promise<ToolResult<AgentToolCodeMatch[]>> {
    try {
      this.logger.debug(`searchCode(pattern=${pattern}, language=${language ?? ""}, pathPattern=${pathPattern ?? ""})`);

      // strip glob-style wildcards from the path filter - fullPath uses a substring match, so wildcards aren't meaningful
      const pathSubstring = pathPattern?.replace(/\*/g, "").trim();

      const files = await this.prisma.repositoryFile.findMany({
        where: {
          projectId,
          language,
          ...(pathSubstring
            ? {
                fullPath: {
                  contains: pathSubstring,
                  mode: "insensitive",
                },
              }
            : {}),
        },
      });

      const regex = new RegExp(pattern, "gi");
      const matches: AgentToolCodeMatch[] = [];

      for (const file of files) {
        const lines = file.rawContent.split("\n");
        const excerpts: string[] = [];

        lines.forEach((line, idx) => {
          if (regex.test(line)) {
            // include line number and content
            excerpts.push(`${idx + 1}: ${line.trim()}`);
          }
        });

        if (excerpts.length > 0) {
          matches.push({
            path: file.fullPath,
            language: file.language,
            excerpts: excerpts.slice(0, 5), // limit to 5 excerpts per file
          });
        }

        // limit total matches
        if (matches.length >= 20) break;
      }

      return {
        success: true,
        data: matches,
      };
    } catch (error) {
      this.logger.error("Failed to search code", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getFileTree(projectId: string): Promise<ToolResult<DirectoryNode>> {
    try {
      this.logger.debug(`getFileTree()`);

      const files = await this.prisma.repositoryFile.findMany({
        where: { projectId },
        select: {
          fullPath: true,
          language: true,
        },
        orderBy: {
          fullPath: "asc",
        },
      });

      // build tree structure
      const root: DirectoryNode = {
        path: "/",
        type: "folder",
        children: [],
      };

      for (const file of files) {
        const parts = file.fullPath.split("/");
        let current = root;

        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const isFile = i === parts.length - 1;

          current.children ??= [];

          let child = current.children.find((c: DirectoryNode) => c.path === part);

          if (!child) {
            child = {
              path: part,
              type: isFile ? "file" : "folder",
              ...(isFile ? { language: file.language } : { children: [] }),
            };
            current.children.push(child);
          }

          if (!isFile) {
            current = child;
          }
        }
      }

      return {
        success: true,
        data: root,
      };
    } catch (error) {
      this.logger.error("Failed to get file tree", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getDirectory(projectId: string, dirPath: string): Promise<ToolResult<DirectoryDetail>> {
    try {
      this.logger.debug(`getDirectory(path=${dirPath})`);

      // normalize for prefix matching of file paths and for the Directory.fullPath lookup
      // Directory.fullPath is stored without the trailing slash; file paths under it always include it
      const normalizedPathWithSlash = dirPath.endsWith("/") ? dirPath : `${dirPath}/`;
      const directoryLookupPath = dirPath.endsWith("/") ? dirPath.slice(0, -1) : dirPath;

      // fetch the directory itself + its immediate children in one query each
      // child directories whose parentId points at this row are the navigational next-level entries
      const directoryRow = await this.prisma.repositoryDirectory.findUnique({
        where: { projectId_fullPath: { projectId, fullPath: directoryLookupPath } },
        select: { id: true, summary: true },
      });

      const childDirectories = directoryRow
        ? await this.prisma.repositoryDirectory.findMany({
            where: { projectId, parentId: directoryRow.id },
            select: { fullPath: true, summary: true },
            orderBy: { fullPath: "asc" },
          })
        : [];

      const files = await this.prisma.repositoryFile.findMany({
        where: {
          projectId,
          fullPath: { startsWith: normalizedPathWithSlash },
        },
        orderBy: { fullPath: "asc" },
      });

      // direct child files only - anything containing another "/" lives in a subdirectory, not at this level
      const directChildFiles = files.flatMap((file) => {
        const relativePath = file.fullPath.substring(normalizedPathWithSlash.length);
        if (relativePath.includes("/")) {
          return [];
        }

        return [
          {
            path: file.fullPath,
            language: file.language,
            lines: (file.metadata as { lines?: number })?.lines ?? 0,
          },
        ];
      });

      const detail: DirectoryDetail = {
        path: dirPath,
        summary: directoryRow?.summary ?? undefined,
        files: directChildFiles,
        childDirectories: childDirectories.map((child) => ({
          path: child.fullPath,
          summary: child.summary ?? undefined,
        })),
      };

      return {
        success: true,
        data: detail,
      };
    } catch (error) {
      this.logger.error("Failed to get directory", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Tool 8: Search files by semantic similarity
   * Uses vector search on file summaries to find relevant files
   */
  async searchFiles(projectId: string, query: string, documentTypes?: string[], topK = 3): Promise<ToolResult> {
    try {
      this.logger.debug(`searchFiles(query=${query}, types=${(documentTypes ?? []).join(",")}, topK=${topK})`);

      // generate embedding for query
      const { embedding: queryEmbedding } = await this.openaiService.generateEmbedding({ input: query });
      const embeddingStr = `[${queryEmbedding.join(",")}]`;

      // build SQL query with vector search
      // Join with Document (for documentType) and Repository (for repositoryType) to get the source type
      const documentTypeFilter =
        documentTypes && documentTypes.length > 0
          ? `AND (d."documentType"::text = ANY($3::text[]) OR r."type"::text = ANY($3::text[]))`
          : "";

      const params =
        documentTypes && documentTypes.length > 0 ? [embeddingStr, topK, documentTypes] : [embeddingStr, topK];

      const results = await this.prisma.$queryRawUnsafe<
        {
          projectId: string;
          projectName: string;
          path: string;
          directorySummary: string | null;
          documentType: string | null;
          summary: string | null;
          similarity: number;
        }[]
      >(
        `
        SELECT
          p.id as "projectId",
          p.name as "projectName",
          cf."fullPath" as path,
          dir.summary as "directorySummary",
          COALESCE(d."documentType"::text, r."type"::text) as "documentType",
          cf.summary,
          1 - (cf."summaryEmbedding" <=> $1::halfvec) as similarity
        FROM "RepositoryFile" cf
        JOIN "Project" p ON cf."projectId" = p.id
        LEFT JOIN "RepositoryDirectory" dir ON cf."directoryId" = dir.id
        LEFT JOIN "ProjectDocument" d ON cf."documentId" = d.id
        LEFT JOIN "Repository" r ON cf."repositoryId" = r.id
        WHERE cf."projectId" = '${projectId}'
          AND cf."summaryEmbedding" IS NOT NULL
          ${documentTypeFilter}
        ORDER BY cf."summaryEmbedding" <=> $1::halfvec
        LIMIT $2
      `,
        ...params,
      );

      // single-project mode: do NOT attach projectSummary - it's already in the system prompt's project_context block
      const fileResults: FileSearchResult[] = results.map((r) => ({
        projectId: r.projectId,
        projectName: r.projectName,
        path: r.path,
        directorySummary: r.directorySummary ?? undefined,
        documentType: r.documentType,
        summary: r.summary ?? "",
        similarity: r.similarity,
      }));

      return {
        success: true,
        data: fileResults,
      };
    } catch (error) {
      this.logger.error("Failed to search files", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Cross-project variant of searchFiles. Searches summary embeddings across every project the actor can read.
   * Returns results enriched with projectId + projectName so the caller can disambiguate or drill in with scoped tools.
   */
  async searchFilesAcrossProjects(
    actor: Actor,
    query: string,
    documentTypes?: string[],
    topK = 3,
  ): Promise<ToolResult<FileSearchResult[]>> {
    try {
      this.logger.debug(
        `searchFilesAcrossProjects(query=${query}, types=${(documentTypes ?? []).join(",")}, topK=${topK})`,
      );

      // resolve the set of projects the actor can read once, then constrain the vector query to that set
      // empty access => empty result without hitting pgvector at all
      const accessibleProjects = await this.prisma.project.findMany({
        where: actor.accessContext.getWhereInputFor("read", "Project"),
        select: { id: true },
      });

      if (accessibleProjects.length === 0) {
        return { success: true, data: [] };
      }

      const projectIds = accessibleProjects.map((project) => project.id);

      const { embedding: queryEmbedding } = await this.openaiService.generateEmbedding({ input: query });
      const embeddingStr = `[${queryEmbedding.join(",")}]`;

      const hasDocTypeFilter = documentTypes && documentTypes.length > 0;
      const documentTypeFilter = hasDocTypeFilter
        ? `AND (d."documentType"::text = ANY($4::text[]) OR r."type"::text = ANY($4::text[]))`
        : "";

      const params = hasDocTypeFilter
        ? [embeddingStr, topK, projectIds, documentTypes]
        : [embeddingStr, topK, projectIds];

      const results = await this.prisma.$queryRawUnsafe<
        {
          projectId: string;
          projectName: string;
          projectSummary: string | null;
          path: string;
          directorySummary: string | null;
          documentType: string | null;
          summary: string | null;
          similarity: number;
        }[]
      >(
        `
        SELECT
          p.id as "projectId",
          p.name as "projectName",
          p.summary as "projectSummary",
          cf."fullPath" as path,
          dir.summary as "directorySummary",
          COALESCE(d."documentType"::text, r."type"::text) as "documentType",
          cf.summary,
          1 - (cf."summaryEmbedding" <=> $1::halfvec) as similarity
        FROM "RepositoryFile" cf
        JOIN "Project" p ON cf."projectId" = p.id
        LEFT JOIN "RepositoryDirectory" dir ON cf."directoryId" = dir.id
        LEFT JOIN "ProjectDocument" d ON cf."documentId" = d.id
        LEFT JOIN "Repository" r ON cf."repositoryId" = r.id
        WHERE cf."projectId" = ANY($3::uuid[])
          AND cf."summaryEmbedding" IS NOT NULL
          ${documentTypeFilter}
        ORDER BY cf."summaryEmbedding" <=> $1::halfvec
        LIMIT $2
      `,
        ...params,
      );

      // cross-project: attach projectSummary (truncated) so the LLM knows what each hit's project is about without a follow-up call
      const fileResults: FileSearchResult[] = results.map((row) => ({
        projectId: row.projectId,
        projectName: row.projectName,
        projectSummary: truncateProjectSummary(row.projectSummary),
        path: row.path,
        directorySummary: row.directorySummary ?? undefined,
        documentType: row.documentType,
        summary: row.summary ?? "",
        similarity: row.similarity,
      }));

      return {
        success: true,
        data: fileResults,
      };
    } catch (error) {
      this.logger.error("Failed to search files across projects", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Cross-project variant of searchSymbols. Applies the actor's CASL Project filter so only readable projects contribute hits.
   * Returns results enriched with projectId + projectName.
   */
  async searchSymbolsAcrossProjects(
    actor: Actor,
    { name, type, pathPattern }: AgentToolSearchSymbol,
  ): Promise<ToolResult<SymbolInfo[]>> {
    try {
      this.logger.debug(
        `searchSymbolsAcrossProjects(name=${name}, type=${type ?? ""}, pathPattern=${pathPattern ?? ""})`,
      );

      const pathSubstring = pathPattern?.replace(/\*/g, "").trim();

      const symbols = await this.prisma.repositoryFileSymbol.findMany({
        where: {
          project: actor.accessContext.getWhereInputFor("read", "Project"),
          name: {
            contains: name,
            mode: "insensitive",
          },
          ...(type ? { type: type } : {}),
          ...(pathSubstring
            ? {
                repositoryFile: {
                  fullPath: {
                    contains: pathSubstring,
                    mode: "insensitive",
                  },
                },
              }
            : {}),
        },
        include: {
          repositoryFile: {
            select: {
              fullPath: true,
              directory: { select: { summary: true } },
            },
          },
          project: {
            select: {
              id: true,
              name: true,
              summary: true,
            },
          },
        },
        take: 50,
      });

      // cross-project: attach projectSummary (truncated) so the LLM knows what each hit's project is about without a follow-up call
      const symbolInfos: SymbolInfo[] = symbols.map((symbol) => ({
        projectId: symbol.project.id,
        projectName: symbol.project.name,
        projectSummary: truncateProjectSummary(symbol.project.summary),
        directorySummary: symbol.repositoryFile.directory?.summary ?? undefined,
        name: symbol.name,
        type: symbol.type,
        filePath: symbol.repositoryFile.fullPath,
        startLine: symbol.startLine ?? undefined,
        endLine: symbol.endLine ?? undefined,
      }));

      return {
        success: true,
        data: symbolInfos,
      };
    } catch (error) {
      this.logger.error("Failed to search symbols across projects", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
