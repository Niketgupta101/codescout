import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { readFileSync } from "fs";
import { PrismaService } from "../../prisma/prisma.service";
import { ParsersService } from "../parsers/parsers.service";
import { calculateChecksum } from "./utils/checksum.util";
import { SymbolType, CodeFileLanguage } from "@prisma/client";
import { GithubService } from "../github/github.service";
import { RepositoriesService } from "../repositories/repositories.service";
import { OpenAIService } from "../openai/openai.service";
import type { ParsedDocument } from "../parsers/types/parsed-document.type";
import { DocumentIndexingOptions } from "./types/document-indexing-options.type";
import { IndexingResult } from "./types/indexing-result.type";
import { RepositoryIndexingOptions } from "./types/repository-indexing-options.type";

const CHUNK_TYPE_TO_SYMBOL_TYPE: Record<string, SymbolType> = {
  function: SymbolType.function,
  class: SymbolType.class,
  interface: SymbolType.interface,
  type: SymbolType.type,
  enum: SymbolType.enum,
  method: SymbolType.function,
};

@Injectable()
export class IndexingService {
  readonly logger = new Logger(IndexingService.name);
  readonly abortControllers = new Map<string, AbortController>();

  constructor(
    readonly prisma: PrismaService,
    readonly parsersService: ParsersService,
    readonly githubService: GithubService,
    @Inject(forwardRef(() => RepositoriesService))
    readonly repositoriesService: RepositoriesService,
    readonly openaiService: OpenAIService,
  ) {}

  async indexDocuments(projectId: string, documents: DocumentIndexingOptions[]): Promise<IndexingResult> {
    const startTime = Date.now();
    this.logger.log(`Starting document indexing for project ${projectId}`);

    const errors: string[] = [];
    let totalFiles = 0;
    let totalSymbols = 0;

    // verify project exists
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    try {
      for (const doc of documents) {
        try {
          const logicalPath = doc.originalName ?? doc.path;
          this.logger.log(`Processing document: ${logicalPath}`);

          // delete existing code file for this document (re-indexing)
          await this.prisma.codeFile.deleteMany({
            where: {
              projectId,
              documentId: doc.documentId,
              fullPath: logicalPath,
            },
          });

          // parse document and extract content
          let parsed: ParsedDocument;
          let rawContent: string;
          let language: CodeFileLanguage;

          if (doc.format === "pdf") {
            const pdfBuffer = readFileSync(doc.path);
            parsed = await this.parsersService.parseDocument(doc.path, doc.format, pdfBuffer);
            rawContent = parsed.rawContent ?? "";
            language = "pdf";
          } else if (doc.format === "csv") {
            parsed = await this.parsersService.parseDocument(doc.path, doc.format);
            rawContent = parsed.rawContent ?? readFileSync(doc.path, "utf-8");
            language = "csv";
          } else if (doc.format === "markdown") {
            rawContent = readFileSync(doc.path, "utf-8");
            parsed = await this.parsersService.parseDocument(doc.path, doc.format);
            language = "markdown";
          } else {
            throw new Error(`Unsupported document format ${doc.format as string}`);
          }

          const checksum = calculateChecksum(rawContent);

          this.logger.log(`Generating summary for ${logicalPath}...`);
          const summary = await this.openaiService.generateFileSummary({
            content: rawContent,
            language,
            filePath: logicalPath,
          });

          this.logger.log(`Generating embedding for ${logicalPath}...`);
          const embedding = await this.openaiService.generateEmbedding({ input: summary });

          const codeFile = await this.prisma.codeFile.create({
            data: {
              projectId,
              documentId: doc.documentId,
              fullPath: logicalPath,
              language,
              rawContent,
              summary,
              checksum,
              metadata: {
                format: doc.format,
                originalPath: doc.path,
              },
            },
          });

          await this._updateVectorEmbedding(codeFile.id, embedding);

          totalFiles++;

          const symbolCount = await this._extractSymbols(projectId, codeFile.id, parsed);
          totalSymbols += symbolCount;

          this.logger.log(`Indexed ${logicalPath}: ${symbolCount} symbols`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorMsg = `Failed to index ${doc.path}: ${errorMessage}`;
          this.logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      const duration = this._formatDuration(Date.now() - startTime);

      this.logger.log(`Document indexing complete: ${totalFiles} files, ${totalSymbols} symbols (${duration})`);

      return {
        projectId,
        totalFiles,
        totalSymbols,
        duration,
        errors,
      };
    } catch (error) {
      this.logger.error("Document indexing failed", error);
      throw error;
    }
  }

  async indexRepository(
    projectId: string,
    { url, branch = "main", repositoryType = "custom", includeTests = false, authToken }: RepositoryIndexingOptions,
  ): Promise<IndexingResult> {
    const startTime = Date.now();

    this.logger.log(`Starting repository indexing for ${url}`);

    const errors: string[] = [];
    let totalFiles = 0;
    let totalSymbols = 0;
    let repository;
    let clonePath: string | null = null;

    try {
      // verify project exists
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      // create or get repository record
      const existingRepository = await this.repositoriesService.findByUrl(projectId, url);
      if (existingRepository) {
        repository = existingRepository;
        this.logger.log(`Re-indexing existing repository: ${repository.id}`);
        await this.repositoriesService.update(repository.id, { status: "cloning" });
      } else {
        repository = await this.repositoriesService.create(projectId, {
          url,
          branch,
          type: repositoryType,
        });
        this.logger.log(`Created repository record: ${repository.id}`);
        await this.repositoriesService.update(repository.id, { status: "cloning" });
      }

      // clone repository
      clonePath = await this.githubService.cloneRepo({
        url,
        branch,
        depth: 1,
        authToken,
      });

      // get commit hash
      const commitHash = await this.githubService.getLatestCommitHash(clonePath);

      // create abort controller
      const abortController = new AbortController();
      this.abortControllers.set(repository.id, abortController);

      // update status: indexing
      await this.repositoriesService.update(repository.id, { lastCommitHash: commitHash, status: "indexing" });

      // list code files
      const files = await this.githubService.listCodeFiles(clonePath, {
        include: [
          "**/*.ts",
          "**/*.tsx",
          "**/*.js",
          "**/*.jsx",
          "**/*.json",
          "**/*.md",
          "**/*.markdown",
          "**/*.yml",
          "**/*.yaml",
          "**/*.prisma",
        ],
        exclude: [
          "node_modules/**",
          "dist/**",
          "build/**",
          "**/.git/**",
          "**/.vscode/**",
          "**/.gitignore",
          "**/.npmrc",
          "**/.nvmrc",
          "**/.env*",
          "**/.prettierrc*",
          "**/.eslintrc*",
          "**/.editorconfig",
          "**/package-lock.json",
          "**/yarn.lock",
          ...(includeTests ? [] : ["**/*.spec.ts", "**/*.test.ts"]),
        ],
        respectGitignore: true,
      });

      this.logger.log(`Found ${files.length} code files to index`);

      const repoName = this.repositoriesService.getRepositoryNameFromUrl(url);

      // get existing files for incremental indexing
      const existingFiles = await this.prisma.codeFile.findMany({
        where: {
          projectId,
          repositoryId: repository.id,
        },
        select: { fullPath: true, checksum: true },
      });

      const existingFileMap = new Map(existingFiles.map((f) => [f.fullPath, f.checksum]));

      this.logger.log(`Found ${existingFiles.length} existing indexed files`);

      const currentFilePaths = new Set<string>();
      let skippedCount = 0;
      let reindexedCount = 0;
      let newCount = 0;

      // index each file
      for (const file of files) {
        // check if cancelled
        const abortController = this.abortControllers.get(repository.id);
        if (abortController?.signal.aborted) {
          this.logger.warn(`Indexing cancelled for repository ${repository.id}`);
          throw new Error("Indexing cancelled by user");
        }

        try {
          const fullPath = `${repoName}/${file.path}`;
          currentFilePaths.add(fullPath);

          // calculate checksum
          const fileChecksum = calculateChecksum(file.content);

          // check if file needs update
          const existingChecksum = existingFileMap.get(fullPath);
          if (existingChecksum === fileChecksum) {
            this.logger.debug(`Skipping unchanged file: ${file.path}`);
            skippedCount++;
            continue;
          }

          const isReindex = existingFileMap.has(fullPath);
          this.logger.log(isReindex ? `Re-indexing changed file: ${file.path}` : `Indexing new file: ${file.path}`);

          if (isReindex) {
            reindexedCount++;
            // delete old CodeFile
            await this.prisma.codeFile.deleteMany({
              where: {
                projectId,
                repositoryId: repository.id,
                fullPath,
              },
            });
          } else {
            newCount++;
          }

          // parse file to extract symbols
          const parsed = await this.parsersService.parseDocument(file.absolutePath, undefined, file.content);

          // generate summary and embedding
          this.logger.log(`Generating summary for ${file.path}...`);
          const summary = await this.openaiService.generateFileSummary({
            content: file.content,
            language: file.language,
            filePath: fullPath,
          });

          this.logger.log(`Generating embedding for ${file.path}...`);
          const embedding = await this.openaiService.generateEmbedding({ input: summary });

          // create CodeFile record
          const codeFile = await this.prisma.codeFile.create({
            data: {
              projectId,
              repositoryId: repository.id,
              fullPath,
              language: file.language,
              rawContent: file.content,
              summary,
              checksum: fileChecksum,
              metadata: {
                commitHash,
                repoUrl: url,
                lines: file.content.split("\n").length,
              },
            },
          });

          await this._updateVectorEmbedding(codeFile.id, embedding);

          totalFiles++;

          const symbolCount = await this._extractSymbols(projectId, codeFile.id, parsed);
          totalSymbols += symbolCount;

          this.logger.log(`Indexed ${file.path}: ${symbolCount} symbols`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorMsg = `Failed to index ${file.path}: ${errorMessage}`;
          this.logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      // delete orphaned files
      const deletedCount = await this._deleteOrphanedFiles(projectId, repository.id, currentFilePaths);

      // update status: completed
      await this.repositoriesService.update(repository.id, {
        status: "completed",
        lastCommitHash: commitHash,
        metadata: {
          fileCount: files.length,
          symbolCount: totalSymbols,
        },
      });

      const duration = this._formatDuration(Date.now() - startTime);

      this.logger.log(`Repository indexing complete: ${totalFiles} files, ${totalSymbols} symbols (${duration})`);
      this.logger.log(
        `Summary: ${newCount} new, ${reindexedCount} updated, ${skippedCount} unchanged, ${deletedCount} deleted`,
      );

      return {
        projectId,
        totalFiles,
        totalSymbols,
        duration,
        errors,
      };
    } catch (error) {
      this.logger.error("Repository indexing failed", error);

      // update repository status to failed
      if (repository) {
        await this.repositoriesService.update(repository.id, {
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }

      throw error;
    } finally {
      // cleanup cloned repository
      if (clonePath) {
        await this.githubService.cleanup(clonePath);
      }

      // cleanup abort controller
      if (repository) {
        this.abortControllers.delete(repository.id);
      }
    }
  }

  cancelIndexing(repositoryId: string): boolean {
    const abortController = this.abortControllers.get(repositoryId);
    if (abortController) {
      abortController.abort();
      this.logger.log(`Cancelled indexing for repository ${repositoryId}`);
      return true;
    }
    return false;
  }

  async _extractSymbols(projectId: string, codeFileId: string, parsed: ParsedDocument): Promise<number> {
    let count = 0;

    // extract symbols from sections and chunks
    const sections = parsed.sections ?? [];

    for (const section of sections) {
      // extract section-level symbols
      const metadata = section.metadata ?? {};

      // epic name (CSV)
      const epicName = metadata.epicName;
      if (epicName && typeof epicName === "string") {
        await this.prisma.symbol.create({
          data: {
            projectId,
            codeFileId,
            type: "heading",
            name: epicName,
            context: section.heading,
          },
        });
        count++;
      }

      // heading (Markdown)
      const heading = metadata.heading;
      if (heading && typeof heading === "string") {
        await this.prisma.symbol.create({
          data: {
            projectId,
            codeFileId,
            type: "heading",
            name: heading,
            context: parsed.sourceFile,
          },
        });
        count++;
      }

      // extract chunk-level symbols
      const chunks = section.chunks ?? [];
      for (const chunk of chunks) {
        const chunkMetadata = chunk.metadata ?? {};

        // story ID (CSV)
        const storyId = chunkMetadata.storyId;
        if (storyId && typeof storyId === "string") {
          await this.prisma.symbol.create({
            data: {
              projectId,
              codeFileId,
              type: "term",
              name: storyId,
              context: chunk.content.substring(0, 100),
            },
          });
          count++;
        }

        // code symbols (TypeScript)
        const chunkType = chunkMetadata.chunkType;
        const name = chunkMetadata.name;
        if (chunkType && name) {
          count += await this._extractCodeSymbols(projectId, codeFileId, chunkMetadata, parsed.sourceFile);
        }

        // keywords (Markdown)
        const keywords = chunkMetadata.keywords;
        if (keywords && Array.isArray(keywords)) {
          const keywordArray = keywords as unknown[];
          for (const keyword of keywordArray.slice(0, 5)) {
            if (typeof keyword === "string") {
              await this.prisma.symbol.create({
                data: {
                  projectId,
                  codeFileId,
                  type: "term",
                  name: keyword,
                  context: chunk.content.substring(0, 100),
                },
              });
              count++;
            }
          }
        }
      }
    }

    return count;
  }

  async _extractCodeSymbols(
    projectId: string,
    codeFileId: string,
    metadata: Record<string, unknown>,
    filePath: string,
  ): Promise<number> {
    let count = 0;
    const chunkType = typeof metadata.chunkType === "string" ? metadata.chunkType : undefined;
    const name = typeof metadata.name === "string" ? metadata.name : undefined;

    if (!chunkType || !name) {
      return 0;
    }

    const symbolType = CHUNK_TYPE_TO_SYMBOL_TYPE[chunkType];
    if (!symbolType) {
      return 0;
    }

    // create symbol
    await this.prisma.symbol.create({
      data: {
        projectId,
        codeFileId,
        type: symbolType,
        name,
        context: filePath,
      },
    });
    count++;

    // for methods, also extract parent class
    const parentClass = typeof metadata.parentClass === "string" ? metadata.parentClass : undefined;
    if (chunkType === "method" && parentClass) {
      await this.prisma.symbol.create({
        data: {
          projectId,
          codeFileId,
          type: "class",
          name: parentClass,
          context: `${filePath} (parent class)`,
        },
      });
      count++;
    }

    return count;
  }

  async _deleteOrphanedFiles(projectId: string, repositoryId: string, currentFilePaths: Set<string>): Promise<number> {
    const existingFiles = await this.prisma.codeFile.findMany({
      where: {
        projectId,
        repositoryId,
      },
      select: { id: true, fullPath: true },
    });

    let deletedCount = 0;
    for (const file of existingFiles) {
      if (!currentFilePaths.has(file.fullPath)) {
        this.logger.log(`Deleting orphaned file: ${file.fullPath}`);
        await this.prisma.codeFile.delete({
          where: { id: file.id },
        });
        deletedCount++;
      }
    }

    return deletedCount;
  }

  async _updateVectorEmbedding(codeFileId: string, embedding: number[]): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "CodeFile"
      SET "summaryEmbedding" = ${`[${embedding.join(",")}]`}::vector
      WHERE id = ${codeFileId}::uuid
    `;
  }

  _formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);

    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }
}
