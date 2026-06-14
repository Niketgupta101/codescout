import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { readFileSync } from "fs";
import { PrismaService } from "../../prisma/prisma.service";
import { ParsersService } from "../parsers/parsers.service";
import { calculateChecksum } from "./utils/checksum.util";
import { SymbolType, RepositoryFileLanguage } from "@prisma/client";
import { GithubService } from "../github/github.service";
import { RepositoriesService } from "../repositories/repositories.service";
import { OpenAIService } from "../openai/openai.service";
import type { ParsedDocument } from "../parsers/types/parsed-document.type";
import { DocumentIndexingOptions } from "./types/document-indexing-options.type";
import { IndexingResult } from "./types/indexing-result.type";
import { RepositoryIndexingOptions } from "./types/repository-indexing-options.type";
import { IndexingDirectoryTreeNode } from "./types/indexing-directory-tree-node.type";
import { IndexingTokenAccumulator } from "./types/indexing-token-accumulator.type";
import {
  buildDirectoryTreeFromCodeFilePaths,
  findContainingDirectoryFullPath,
} from "./utils/build-directory-tree.util";
import { buildEmptyIndexingTokenAccumulator, logIndexingCostBreakdown } from "./utils/indexing-cost.util";
import { buildRepositoryIndexFileFilter } from "./utils/repository-file-filter.util";
import { detectNextJsFileMetadata } from "./utils/detect-nextjs-file-metadata.util";
import { OpenAiFileOrDirectoryPathSummary } from "../openai/types/openai-file-or-directory-path-summary.type";

const CHUNK_TYPE_TO_SYMBOL_TYPE: Record<string, SymbolType> = {
  function: SymbolType.function,
  class: SymbolType.class,
  interface: SymbolType.interface,
  type: SymbolType.type,
  enum: SymbolType.enum,
  method: SymbolType.function,
  // arrow functions come out of the parser as their own chunkType - without this mapping every `const x = () => ...` export was getting dropped at the indexer stage
  "arrow-function": SymbolType.function,
  // emitted for non-function constants (object literals, array literals, CallExpression results like axios.create(...), styled.div`...` defaults that don't tie to an inner identifier)
  variable: SymbolType.variable,
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
    const tokenAccumulator = buildEmptyIndexingTokenAccumulator();
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
          await this.prisma.repositoryFile.deleteMany({
            where: {
              projectId,
              documentId: doc.documentId,
              fullPath: logicalPath,
            },
          });

          // parse document and extract content
          let parsed: ParsedDocument;
          let rawContent: string;
          let language: RepositoryFileLanguage;

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
          const { summary, usage: summaryUsage } = await this.openaiService.generateFileSummary({
            content: rawContent,
            language,
            filePath: logicalPath,
          });

          tokenAccumulator.fileSummaryInputTokens += summaryUsage.inputTokens;
          tokenAccumulator.fileSummaryOutputTokens += summaryUsage.outputTokens;
          tokenAccumulator.fileSummaryCallCount += 1;

          this.logger.log(`Generating embedding for ${logicalPath}...`);
          const { embedding, usage: embeddingUsage } = await this.openaiService.generateEmbedding({ input: summary });

          tokenAccumulator.fileEmbeddingInputTokens += embeddingUsage.inputTokens;
          tokenAccumulator.fileEmbeddingCallCount += 1;

          const repositoryFile = await this.prisma.repositoryFile.create({
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

          await this._updateVectorEmbedding(repositoryFile.id, embedding);

          totalFiles++;

          const symbolCount = await this._extractSymbols(projectId, repositoryFile.id, parsed);
          totalSymbols += symbolCount;

          this.logger.log(`Indexed ${logicalPath}: ${symbolCount} symbols`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorMsg = `Failed to index ${doc.path}: ${errorMessage}`;
          this.logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      // generate hierarchical summaries before reporting "complete" so callers can rely on Project.summary being populated when indexing returns
      await this._hierarchicalSummariesGenerate(projectId, tokenAccumulator);

      const duration = this._formatDuration(Date.now() - startTime);

      this.logger.log(`Document indexing complete: ${totalFiles} files, ${totalSymbols} symbols (${duration})`);

      logIndexingCostBreakdown({
        logger: this.logger,
        context: `documents in project ${projectId}`,
        accumulator: tokenAccumulator,
      });

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
    const tokenAccumulator = buildEmptyIndexingTokenAccumulator();
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

      // list code files using the shared filter (matches what IndexingCostService estimates against)
      const files = await this.githubService.listCodeFiles(clonePath, buildRepositoryIndexFileFilter({ includeTests }));

      this.logger.log(`Found ${files.length} code files to index`);

      const repoName = this.repositoriesService.getRepositoryNameFromUrl(url);

      // get existing files for incremental indexing
      const existingFiles = await this.prisma.repositoryFile.findMany({
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
            await this.prisma.repositoryFile.deleteMany({
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
          const { summary, usage: summaryUsage } = await this.openaiService.generateFileSummary({
            content: file.content,
            language: file.language,
            filePath: fullPath,
          });

          tokenAccumulator.fileSummaryInputTokens += summaryUsage.inputTokens;
          tokenAccumulator.fileSummaryOutputTokens += summaryUsage.outputTokens;
          tokenAccumulator.fileSummaryCallCount += 1;

          this.logger.log(`Generating embedding for ${file.path}...`);
          const { embedding, usage: embeddingUsage } = await this.openaiService.generateEmbedding({ input: summary });

          tokenAccumulator.fileEmbeddingInputTokens += embeddingUsage.inputTokens;
          tokenAccumulator.fileEmbeddingCallCount += 1;

          // detect next.js role + runtime so overview-type queries can filter without re-parsing
          // safe to run on non-next.js repos: returns an empty object when nothing matches
          const nextJsFileMetadata = detectNextJsFileMetadata({
            fullPath,
            rawContent: file.content,
          });

          // create CodeFile record
          const repositoryFile = await this.prisma.repositoryFile.create({
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
                ...nextJsFileMetadata,
              },
            },
          });

          await this._updateVectorEmbedding(repositoryFile.id, embedding);

          totalFiles++;

          const symbolCount = await this._extractSymbols(projectId, repositoryFile.id, parsed);
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

      // generate hierarchical summaries before flipping status to completed so search/chat can rely on summaries being populated when status flips
      await this._hierarchicalSummariesGenerate(projectId, tokenAccumulator);

      // update status: completed
      await this.repositoriesService.update(repository.id, {
        status: "completed",
        lastCommitHash: commitHash,
      });

      const duration = this._formatDuration(Date.now() - startTime);

      this.logger.log(`Repository indexing complete: ${totalFiles} files, ${totalSymbols} symbols (${duration})`);
      this.logger.log(
        `Summary: ${newCount} new, ${reindexedCount} updated, ${skippedCount} unchanged, ${deletedCount} deleted`,
      );

      logIndexingCostBreakdown({
        logger: this.logger,
        context: `repository ${url}`,
        accumulator: tokenAccumulator,
      });

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

  async _extractSymbols(projectId: string, repositoryFileId: string, parsed: ParsedDocument): Promise<number> {
    let count = 0;

    // extract symbols from sections and chunks
    const sections = parsed.sections ?? [];

    for (const section of sections) {
      // extract section-level symbols
      const metadata = section.metadata ?? {};

      // epic name (CSV) - domain lookup for user-story projects, distinct from markdown headings
      const epicName = metadata.epicName;
      if (epicName && typeof epicName === "string") {
        await this.prisma.repositoryFileSymbol.create({
          data: {
            projectId,
            repositoryFileId,
            type: "heading",
            name: epicName,
          },
        });
        count++;
      }

      // markdown headings are intentionally NOT emitted as symbols - codeFileSearch over file summaries handles "find docs about X" better than keyword lookup over heading text

      // extract chunk-level symbols
      const chunks = section.chunks ?? [];
      for (const chunk of chunks) {
        const chunkMetadata = chunk.metadata ?? {};

        // story ID (CSV) - domain lookup for user-story projects
        const storyId = chunkMetadata.storyId;
        if (storyId && typeof storyId === "string") {
          await this.prisma.repositoryFileSymbol.create({
            data: {
              projectId,
              repositoryFileId,
              type: "term",
              name: storyId,
            },
          });
          count++;
        }

        // code symbols (TypeScript)
        const chunkType = chunkMetadata.chunkType;
        const name = chunkMetadata.name;
        if (chunkType && name) {
          count += await this._extractCodeSymbols(projectId, repositoryFileId, chunkMetadata);
        }

        // markdown keyword terms are intentionally NOT emitted - extracted top-5 keywords were stopwords ("for", "see", "github") that polluted symbolSearch results
      }
    }

    return count;
  }

  async _extractCodeSymbols(projectId: string, repositoryFileId: string, metadata: Record<string, unknown>): Promise<number> {
    const chunkType = typeof metadata.chunkType === "string" ? metadata.chunkType : undefined;
    const name = typeof metadata.name === "string" ? metadata.name : undefined;

    if (!chunkType || !name) {
      return 0;
    }

    const symbolType = CHUNK_TYPE_TO_SYMBOL_TYPE[chunkType];
    if (!symbolType) {
      return 0;
    }

    // 1-indexed inclusive line range from the parser (ts-morph getLineAndColumnAtPos); used by callers to do precise read_file_range calls
    const startLine = typeof metadata.startLine === "number" ? metadata.startLine : null;
    const endLine = typeof metadata.endLine === "number" ? metadata.endLine : null;

    await this.prisma.repositoryFileSymbol.create({
      data: {
        projectId,
        repositoryFileId,
        type: symbolType,
        name,
        startLine,
        endLine,
      },
    });

    // parent-class shortcut rows are intentionally NOT emitted - the class declaration walk already produces a class row with a real line range
    return 1;
  }

  async _deleteOrphanedFiles(projectId: string, repositoryId: string, currentFilePaths: Set<string>): Promise<number> {
    const existingFiles = await this.prisma.repositoryFile.findMany({
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
        await this.prisma.repositoryFile.delete({
          where: { id: file.id },
        });
        deletedCount++;
      }
    }

    return deletedCount;
  }

  async _updateVectorEmbedding(repositoryFileId: string, embedding: number[]): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "RepositoryFile"
      SET "summaryEmbedding" = ${`[${embedding.join(",")}]`}::halfvec
      WHERE id = ${repositoryFileId}::uuid
    `;
  }

  _formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);

    // sub-minute durations don't need the leading "0m" - keep them compact
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }

    return `${seconds}s`;
  }

  async _hierarchicalSummariesGenerate(projectId: string, tokenAccumulator: IndexingTokenAccumulator): Promise<void> {
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { id: true, name: true },
    });

    const repositoryFiles = await this.prisma.repositoryFile.findMany({
      where: { projectId },
      select: { id: true, fullPath: true, summary: true },
    });

    // nothing to summarize on an empty project - leave Project.summary and Directory rows untouched
    if (repositoryFiles.length === 0) {
      this.logger.log(`Skipping hierarchical summaries for empty project ${projectId}`);
      return;
    }

    this.logger.log(`Generating hierarchical summaries for project ${project.name} (${repositoryFiles.length} files)`);

    const treeNodes = buildDirectoryTreeFromCodeFilePaths(repositoryFiles.map((repositoryFile) => repositoryFile.fullPath));

    const fullPathToDirectoryId = await this._directoriesUpsertFromTree(projectId, treeNodes);

    await this._codeFilesLinkToDirectories(repositoryFiles, fullPathToDirectoryId);

    const directorySummariesByFullPath = await this._directorySummariesGenerateBottomUp({
      projectName: project.name,
      projectId,
      treeNodes,
      repositoryFiles,
      tokenAccumulator,
    });

    await this._projectSummaryGenerate({
      projectId,
      projectName: project.name,
      treeNodes,
      tokenAccumulator,
      directorySummariesByFullPath,
    });

    this.logger.log(`Hierarchical summaries complete for project ${project.name}`);
  }

  async _directoriesUpsertFromTree(
    projectId: string,
    treeNodes: IndexingDirectoryTreeNode[],
  ): Promise<Map<string, string>> {
    const fullPathToDirectoryId = new Map<string, string>();

    // tree is sorted depth ascending so each directory's parent is always upserted first
    // this keeps the parentId FK satisfied without deferring constraints
    for (const node of treeNodes) {
      // root-level directories have no parent in our hierarchy
      // deeper ones look up their parent's id from the map populated by previous iterations
      const parentId = node.parentFullPath ? (fullPathToDirectoryId.get(node.parentFullPath) ?? null) : null;

      const directory = await this.prisma.repositoryDirectory.upsert({
        where: { projectId_fullPath: { projectId, fullPath: node.fullPath } },
        create: {
          projectId,
          fullPath: node.fullPath,
          depth: node.depth,
          parentId,
        },
        update: {
          parentId,
          depth: node.depth,
        },
        select: { id: true },
      });

      fullPathToDirectoryId.set(node.fullPath, directory.id);
    }

    return fullPathToDirectoryId;
  }

  async _codeFilesLinkToDirectories(
    repositoryFiles: { id: string; fullPath: string }[],
    fullPathToDirectoryId: Map<string, string>,
  ): Promise<void> {
    for (const repositoryFile of repositoryFiles) {
      const containingDirectoryFullPath = findContainingDirectoryFullPath(repositoryFile.fullPath);

      // file at project root has no containing directory - leave directoryId null
      // otherwise resolve to the upserted Directory row's id
      const directoryId = containingDirectoryFullPath
        ? (fullPathToDirectoryId.get(containingDirectoryFullPath) ?? null)
        : null;

      await this.prisma.repositoryFile.update({
        where: { id: repositoryFile.id },
        data: { directoryId },
      });
    }
  }

  async _directorySummariesGenerateBottomUp({
    projectName,
    projectId,
    treeNodes,
    repositoryFiles,
    tokenAccumulator,
  }: {
    projectName: string;
    projectId: string;
    treeNodes: IndexingDirectoryTreeNode[];
    repositoryFiles: { fullPath: string; summary: string | null }[];
    tokenAccumulator: IndexingTokenAccumulator;
  }): Promise<Map<string, string>> {
    const directorySummariesByFullPath = new Map<string, string>();
    const depthsDescending = [...new Set(treeNodes.map((node) => node.depth))].sort((a, b) => b - a);

    // process leaves first so each non-leaf directory has its children's summaries available when summarized
    for (const depth of depthsDescending) {
      const directoriesAtDepth = treeNodes.filter((node) => node.depth === depth);

      await Promise.all(
        directoriesAtDepth.map(async (directoryNode) => {
          const fileSummaries: OpenAiFileOrDirectoryPathSummary[] = repositoryFiles
            .filter(
              (repositoryFile) =>
                findContainingDirectoryFullPath(repositoryFile.fullPath) === directoryNode.fullPath && repositoryFile.summary,
            )
            .map((repositoryFile) => ({ fullPath: repositoryFile.fullPath, summary: repositoryFile.summary! }));

          const childDirectorySummaries: OpenAiFileOrDirectoryPathSummary[] = treeNodes
            .filter((node) => node.parentFullPath === directoryNode.fullPath)
            .map((childNode) => ({
              fullPath: childNode.fullPath,
              summary: directorySummariesByFullPath.get(childNode.fullPath) ?? "",
            }))
            .filter((childSummary) => childSummary.summary.length > 0);

          // a directory with neither summarized files nor summarized children has no useful content to feed the LLM
          if (fileSummaries.length === 0 && childDirectorySummaries.length === 0) {
            return;
          }

          try {
            const { summary, usage } = await this.openaiService.generateDirectorySummary({
              projectName,
              directoryFullPath: directoryNode.fullPath,
              fileSummaries,
              childDirectorySummaries,
            });

            tokenAccumulator.directorySummaryInputTokens += usage.inputTokens;
            tokenAccumulator.directorySummaryOutputTokens += usage.outputTokens;
            tokenAccumulator.directorySummaryCallCount += 1;

            directorySummariesByFullPath.set(directoryNode.fullPath, summary);

            await this.prisma.repositoryDirectory.update({
              where: { projectId_fullPath: { projectId, fullPath: directoryNode.fullPath } },
              data: { summary },
            });
          } catch (error) {
            // one failed directory shouldn't take down the whole pass - log and move on so other directories still get summarized
            this.logger.error(`Failed to generate summary for directory ${directoryNode.fullPath}`, error);
          }
        }),
      );
    }

    return directorySummariesByFullPath;
  }

  async _projectSummaryGenerate({
    projectId,
    projectName,
    treeNodes,
    directorySummariesByFullPath,
    tokenAccumulator,
  }: {
    projectId: string;
    projectName: string;
    treeNodes: IndexingDirectoryTreeNode[];
    directorySummariesByFullPath: Map<string, string>;
    tokenAccumulator: IndexingTokenAccumulator;
  }): Promise<void> {
    const topLevelDirectorySummaries: OpenAiFileOrDirectoryPathSummary[] = treeNodes
      .filter((node) => node.depth === 1)
      .map((node) => ({
        fullPath: node.fullPath,
        summary: directorySummariesByFullPath.get(node.fullPath) ?? "",
      }))
      .filter((entry) => entry.summary.length > 0);

    // no top-level summaries means all directory generations failed or the project is structurally empty
    // skip the project-level call rather than feeding the LLM nothing
    if (topLevelDirectorySummaries.length === 0) {
      this.logger.warn(
        `No top-level directory summaries available for project ${projectId} - skipping project summary`,
      );
      return;
    }

    try {
      const { summary: projectSummary, usage } = await this.openaiService.generateProjectSummary({
        projectName,
        topLevelDirectorySummaries,
      });

      tokenAccumulator.projectSummaryInputTokens += usage.inputTokens;
      tokenAccumulator.projectSummaryOutputTokens += usage.outputTokens;
      tokenAccumulator.projectSummaryCallCount += 1;

      await this.prisma.project.update({
        where: { id: projectId },
        data: { summary: projectSummary },
      });
    } catch (error) {
      this.logger.error(`Failed to generate project summary for ${projectId}`, error);
    }
  }
}
