import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { OpenAIService } from "../openai/openai.service";
import type { ToolResult } from "./types/tool-result.type";
import type { FileInfo } from "./types/file-info.type";
import type { SymbolInfo } from "./types/symbol-info.type";
import type { DirectoryNode } from "./types/directory-node.type";
import type { ProjectStats } from "./types/project-stats.type";
import type { FileSearchResult } from "./types/file-search-result.type";
import type { AgentToolReadFileResult } from "./types/agent-tool-read-file-result.type";
import type { AgentToolCodeMatch } from "./types/agent-tool-code-match.type";
import { AgentToolListFileDto } from "./dtos/agent-tool-list-file.dto";
import { AgentToolSearchSymbol } from "./dtos/agent-tool-search-symbol.dto";
import { AgentToolSearchCodeDto } from "./dtos/agent-tool-search-code.dto";

@Injectable()
export class AgentToolsService {
  readonly logger = new Logger(AgentToolsService.name);

  constructor(
    readonly prisma: PrismaService,
    readonly openaiService: OpenAIService,
  ) {}

  async listFiles(projectId: string, { regex }: AgentToolListFileDto): Promise<ToolResult<FileInfo[]>> {
    try {
      this.logger.debug(`listFiles(regex=${regex ?? ""})`);

      const files = await this.prisma.codeFile.findMany({
        where: {
          projectId,
          ...(regex
            ? {
                path: {
                  contains: regex.replace("*", ""),
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

      return {
        success: true,
        data: {
          path: file.fullPath,
          language: file.language,
          content: file.rawContent,
          metadata: file.metadata,
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

  /**
   * Search symbols by name and/or type
   * Examples: search_symbols("AuthService"), search_symbols("login", "function")
   */
  async searchSymbols(projectId: string, { name, type }: AgentToolSearchSymbol): Promise<ToolResult<SymbolInfo[]>> {
    try {
      this.logger.debug(`searchSymbols(name=${name}, type=${type ?? ""})`);

      const symbols = await this.prisma.symbol.findMany({
        where: {
          projectId,
          name: {
            contains: name,
            mode: "insensitive",
          },
          ...(type ? { type: type } : {}),
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
        context: symbol.context ?? undefined,
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
    { pattern, language }: AgentToolSearchCodeDto,
  ): Promise<ToolResult<AgentToolCodeMatch[]>> {
    try {
      this.logger.debug(`searchCode(pattern=${pattern}, language=${language ?? ""})`);

      const files = await this.prisma.codeFile.findMany({
        where: {
          projectId,
          language,
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

  async getStats(projectId: string): Promise<ToolResult<ProjectStats>> {
    try {
      this.logger.debug(`getStats()`);

      const [filesByLanguage, symbolsByType, totalFiles, totalSymbols] = await Promise.all([
        this.prisma.codeFile.groupBy({
          by: ["language"],
          where: { projectId },
          _count: true,
        }),
        this.prisma.symbol.groupBy({
          by: ["type"],
          where: { projectId },
          _count: true,
        }),
        this.prisma.codeFile.count({
          where: { projectId },
        }),
        this.prisma.symbol.count({
          where: { projectId },
        }),
      ]);

      const stats: ProjectStats = {
        totalFiles,
        filesByLanguage: filesByLanguage.reduce(
          (acc, item) => {
            acc[item.language] = item._count;
            return acc;
          },
          {} as Record<string, number>,
        ),
        totalSymbols,
        symbolsByType: symbolsByType.reduce(
          (acc, item) => {
            acc[item.type] = item._count;
            return acc;
          },
          {} as Record<string, number>,
        ),
      };

      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      this.logger.error("Failed to get stats", error);
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
  async searchFiles(projectId: string, query: string, documentTypes?: string[], topK = 10): Promise<ToolResult> {
    try {
      this.logger.debug(`searchFiles(query=${query}, types=${(documentTypes ?? []).join(",")}, topK=${topK})`);

      // generate embedding for query
      const queryEmbedding = await this.openaiService.generateEmbedding({ input: query });
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
          1 - (cf."summaryEmbedding" <=> $1::vector) as similarity
        FROM "CodeFile" cf
        LEFT JOIN "Document" d ON cf."documentId" = d.id
        LEFT JOIN "Repository" r ON cf."repositoryId" = r.id
        WHERE cf."projectId" = '${projectId}'
          AND cf."summaryEmbedding" IS NOT NULL
          ${documentTypeFilter}
        ORDER BY cf."summaryEmbedding" <=> $1::vector
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
