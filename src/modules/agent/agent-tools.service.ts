import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { OpenAIService } from "../openai/openai.service";
import type { ToolResult } from "./types/tool-result.type";
import type { FileInfo } from "./types/file-info.type";
import type { SymbolInfo } from "./types/symbol-info.type";
import type { DirectoryNode } from "./types/directory-node.type";
import type { FileSearchResult } from "./types/file-search-result.type";
import type { AgentToolReadFileResult } from "./types/agent-tool-read-file-result.type";
import type { AgentToolCodeMatch } from "./types/agent-tool-code-match.type";
import { AgentToolListFileDto } from "./dtos/agent-tool-list-file.dto";
import { AgentToolSearchSymbol } from "./dtos/agent-tool-search-symbol.dto";
import { AgentToolSearchCodeDto } from "./dtos/agent-tool-search-code.dto";

// safety cap on the number of lines a single read returns, applied to both readFile (whole-file) and readFileRange (specific span)
// chosen to be generous enough that typical service files (200-1500 lines) fit unclipped, while bounding pathological cases (giant generated files)
const MAX_READ_FILE_LINES = 1500;

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

      const files = await this.prisma.codeFile.findMany({
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

      const file = await this.prisma.codeFile.findFirst({
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

      // read_file returns the full file always; callers are expected to pick the right tool upfront — read_file for small files (DTOs, types, controllers), search_symbols + read_file_range for large ones (services, routers)
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

      // validate the requested range early — invalid input would silently produce empty or garbage output otherwise
      if (
        !Number.isInteger(startLine) ||
        !Number.isInteger(endLine) ||
        startLine < 1 ||
        endLine < startLine
      ) {
        return {
          success: false,
          error: `Invalid line range: startLine=${startLine}, endLine=${endLine}. Must satisfy 1 <= startLine <= endLine.`,
        };
      }

      const file = await this.prisma.codeFile.findFirst({
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

      // clamp end to file length — asking past EOF is fine, just return what exists
      // separately, cap the range size at MAX_READ_FILE_LINES so a single call can't pull arbitrarily large spans
      const clampedEnd = Math.min(endLine, totalLines);
      const cappedEnd = Math.min(clampedEnd, startLine + MAX_READ_FILE_LINES - 1);
      const truncated = cappedEnd < clampedEnd;

      const returnedLines = allLines.slice(startLine - 1, cappedEnd);
      let content = returnedLines.join("\n");

      if (truncated) {
        content += `\n\n[range capped at line ${cappedEnd} (${MAX_READ_FILE_LINES} max) — call read_file_range again with a later startLine to continue]`;
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

      // strip glob-style wildcards from the path filter — fullPath uses a substring match, so wildcards aren't meaningful
      const pathSubstring = pathPattern?.replace(/\*/g, "").trim();

      const symbols = await this.prisma.symbol.findMany({
        where: {
          projectId,
          name: {
            contains: name,
            mode: "insensitive",
          },
          ...(type ? { type: type } : {}),
          ...(pathSubstring
            ? {
                codeFile: {
                  fullPath: {
                    contains: pathSubstring,
                    mode: "insensitive",
                  },
                },
              }
            : {}),
        },
        include: {
          codeFile: {
            select: {
              fullPath: true,
            },
          },
        },
        take: 50, // limit results
      });

      const symbolInfos: SymbolInfo[] = symbols.map((symbol) => ({
        name: symbol.name,
        type: symbol.type,
        filePath: symbol.codeFile.fullPath,
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

      // strip glob-style wildcards from the path filter — fullPath uses a substring match, so wildcards aren't meaningful
      const pathSubstring = pathPattern?.replace(/\*/g, "").trim();

      const files = await this.prisma.codeFile.findMany({
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

      const files = await this.prisma.codeFile.findMany({
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

  async getDirectory(projectId: string, dirPath: string): Promise<ToolResult> {
    try {
      this.logger.debug(`getDirectory(path=${dirPath})`);

      // normalize path
      const normalizedPath = dirPath.endsWith("/") ? dirPath : `${dirPath}/`;

      const files = await this.prisma.codeFile.findMany({
        where: {
          projectId,
          fullPath: {
            startsWith: normalizedPath,
          },
        },
        orderBy: {
          fullPath: "asc",
        },
      });

      // filter to only direct children (not nested)
      const directChildren = files
        .map((f) => {
          const relativePath = f.fullPath.substring(normalizedPath.length);
          const isDirectChild = !relativePath.includes("/");

          if (isDirectChild) {
            return {
              path: f.fullPath,
              language: f.language,
              lines: (f.metadata as { lines?: number })?.lines ?? 0,
            };
          }
          return null;
        })
        .filter((f) => f !== null);

      return {
        success: true,
        data: directChildren,
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
          path: string;
          documentType: string | null;
          summary: string | null;
          similarity: number;
        }[]
      >(
        `
        SELECT
          cf."fullPath" as path,
          COALESCE(d."documentType"::text, r."type"::text) as "documentType",
          cf.summary,
          1 - (cf."summaryEmbedding" <=> $1::halfvec) as similarity
        FROM "CodeFile" cf
        LEFT JOIN "Document" d ON cf."documentId" = d.id
        LEFT JOIN "Repository" r ON cf."repositoryId" = r.id
        WHERE cf."projectId" = '${projectId}'
          AND cf."summaryEmbedding" IS NOT NULL
          ${documentTypeFilter}
        ORDER BY cf."summaryEmbedding" <=> $1::halfvec
        LIMIT $2
      `,
        ...params,
      );

      const fileResults: FileSearchResult[] = results.map((r) => ({
        path: r.path,
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
}
