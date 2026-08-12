import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ParsersService } from "../parsers/parsers.service";
import { calculateChecksum } from "./utils/checksum.util";
import {
  SymbolType,
  ProjectDocumentType,
  ProjectDocumentStatementType,
  ProjectDocumentDecisionStatus,
  ProjectDocumentImplementationStatus,
  ProjectDocumentActionItemStatus,
  ProjectTopicType,
  ProjectDataOrigin,
} from "@prisma/client";
import { GithubService } from "../github/github.service";
import { RepositoriesService } from "../repositories/repositories.service";
import { OpenAIService } from "../openai/openai.service";
import type { ParsedDocument } from "../parsers/types/parsed-document.type";
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
import {
  filterRetrievalReadyActionItems,
  filterRetrievalReadyStatements,
  filterStatementsDuplicatedByActions,
} from "./utils/extraction-quality.util";
import { selectDocumentExtractionContents } from "./utils/document-extraction-content.util";

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

  async projectDocumentIndex(projectDocumentId: string): Promise<void> {
    const projectDocument = await this.prisma.projectDocument.findUniqueOrThrow({ where: { id: projectDocumentId } });

    this.logger.log(`Indexing document ${projectDocument.path}`);

    await this.prisma.projectDocument.update({
      where: { id: projectDocument.id },
      data: { status: "indexing", error: null },
    });

    try {
      // markitdown normalizes every source to markdown upstream
      const { summary } = await this.openaiService.generateFileSummary({
        content: projectDocument.contentRaw,
        language: "markdown",
        filePath: projectDocument.path,
      });

      const { embedding } = await this.openaiService.generateEmbedding({ input: summary });

      await this.prisma.projectDocument.update({
        where: { id: projectDocument.id },
        data: { summary, status: "completed" },
      });

      // summary embedding is an unsupported halfvec column so it is written via raw sql
      await this.prisma.$executeRaw`
        UPDATE "ProjectDocument"
        SET "summaryEmbedding" = ${`[${embedding.join(",")}]`}::halfvec
        WHERE id = ${projectDocument.id}::uuid
      `;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to index document ${projectDocument.path}`, error);

      await this.prisma.projectDocument.update({
        where: { id: projectDocument.id },
        data: { status: "failed", error: message },
      });
    }
  }

  /**
   * Infers a document's genre (ProjectDocumentType) and event date from its content, recording the classifier output.
   * Non-critical: on failure the type/date are left at their provisional values so a bad classification never fails the import.
   * @param projectDocumentId - the document to classify
   */
  async projectDocumentClassify(projectDocumentId: string): Promise<void> {
    const projectDocument = await this.prisma.projectDocument.findUniqueOrThrow({ where: { id: projectDocumentId } });

    this.logger.log(`Classifying document ${projectDocument.path}`);

    try {
      const classification = await this.openaiService.generateDocumentClassification({
        content: projectDocument.contentRaw,
        name: projectDocument.name,
        types: Object.values(ProjectDocumentType),
      });

      // the model is constrained to the enum, but fall back to other if it ever drifts
      const type = (Object.values(ProjectDocumentType) as string[]).includes(classification.type)
        ? (classification.type as ProjectDocumentType)
        : ProjectDocumentType.other;

      // refine the provisional occurredAt with the inferred event date when it parses
      const inferredOccurredAt = classification.occurredAt ? new Date(classification.occurredAt) : null;
      const occurredAt =
        inferredOccurredAt && !Number.isNaN(inferredOccurredAt.getTime()) ? inferredOccurredAt : undefined;

      await this.prisma.projectDocument.update({
        where: { id: projectDocument.id },
        data: {
          type,
          ...(occurredAt && { occurredAt }),
          aiClassificationOutput: JSON.stringify({
            type: classification.type,
            rationale: classification.rationale,
            confidence: classification.confidence,
            occurredAt: classification.occurredAt,
          }),
        },
      });
    } catch (error) {
      // classification is non-critical: leave type/date at their provisional values and log
      this.logger.error(`Failed to classify document ${projectDocument.path}`, error);
    }
  }

  /**
   * Extracts the local knowledge graph (topics, statements, action items, references) from a document.
   * Only LOCAL fields are written here; threading and bi-temporal validity are left to the reconciler.
   * Non-critical: on failure the document stays indexed without statements rather than failing.
   * @param projectDocumentId - the document to extract from
   */
  async projectDocumentExtract(projectDocumentId: string): Promise<boolean> {
    const projectDocument = await this.prisma.projectDocument.findUniqueOrThrow({
      where: { id: projectDocumentId },
      include: {
        project: {
          select: {
            name: true,
            description: true,
          },
        },
      },
    });

    this.logger.log(`Extracting document ${projectDocument.path}`);

    // reconciler-only enum values are excluded so extraction can only set locally-observable states
    const decisionStatuses: ProjectDocumentDecisionStatus[] = Object.values(ProjectDocumentDecisionStatus).filter(
      (status) => status !== ProjectDocumentDecisionStatus.superseded,
    );
    const implementationStatuses: ProjectDocumentImplementationStatus[] = Object.values(
      ProjectDocumentImplementationStatus,
    ).filter((status) => status !== ProjectDocumentImplementationStatus.reverted);
    const actionItemStatuses: ProjectDocumentActionItemStatus[] = Object.values(ProjectDocumentActionItemStatus).filter(
      (status) => status !== ProjectDocumentActionItemStatus.lapsed,
    );

    try {
      const projectContext = [
        `Project name: ${projectDocument.project.name}`,
        projectDocument.project.description ? `Description: ${projectDocument.project.description}` : null,
      ]
        .filter((line): line is string => !!line)
        .join("\n")
        .slice(0, 8000);
      const extractionContents = selectDocumentExtractionContents(projectDocument.contentRaw);
      if (extractionContents.usedCuratedSections) {
        this.logger.log(
          `Using structured meeting sections for ${projectDocument.path}: ${extractionContents.statementContent.length} statement characters, ${extractionContents.actionContent.length} action characters, ${projectDocument.contentRaw.length} raw characters`,
        );
      }

      // extraction produces statements liberally; its own topic enumeration is discarded in favor of grouping below
      const { extraction } = await this.openaiService.generateDocumentExtraction({
        content: extractionContents.statementContent,
        actionContent: extractionContents.actionContent,
        name: projectDocument.name,
        projectContext,
        documentType: projectDocument.type,
        enums: {
          statementType: Object.values(ProjectDocumentStatementType),
          decisionStatus: decisionStatuses,
          implementationStatus: implementationStatuses,
          actionItemStatus: actionItemStatuses,
        },
      });

      // Statements and actions have different quality contracts. Curate them independently so fragments can be merged,
      // vague text can be rewritten from its source, and requirements do not leak into the action-item list.
      const curateStatements = () =>
        this.openaiService.generateStatementCuration({
          statements: extraction.statements,
          name: projectDocument.name,
          projectContext,
          documentType: projectDocument.type,
          enums: {
            statementType: Object.values(ProjectDocumentStatementType),
            decisionStatus: decisionStatuses,
            implementationStatus: implementationStatuses,
          },
        });
      const curateActionItems = () =>
        this.openaiService.generateActionItemCuration({
          actionItems: extraction.actionItems,
          name: projectDocument.name,
          projectContext,
          documentType: projectDocument.type,
          enums: { actionItemStatus: actionItemStatuses },
        });
      const [statementCuration, actionItemCuration] =
        this.openaiService.inferenceConcurrency === 1
          ? [await curateStatements(), await curateActionItems()]
          : await Promise.all([curateStatements(), curateActionItems()]);
      const keptActionItems = filterRetrievalReadyActionItems(actionItemCuration.actionItems);
      const keptStatements = filterStatementsDuplicatedByActions(
        filterRetrievalReadyStatements(statementCuration.statements),
        keptActionItems,
      );

      // group statements, action items, and references together into shared doc-topics, so actions and references
      // route to the grouped topics instead of the raw extraction's per-item names
      const groupingTexts = [
        ...keptStatements.map((statement) => statement.textDerived),
        ...keptActionItems.map((actionItem) => actionItem.description),
        ...extraction.references.map((reference) => reference.referentText),
      ];

      const topicNameByGroupingIndex: (string | undefined)[] = groupingTexts.map(() => undefined);

      if (groupingTexts.length > 0) {
        const { groups } = await this.openaiService.generateStatementGrouping({
          statements: groupingTexts,
          types: Object.values(ProjectTopicType),
        });

        for (const group of groups) {
          for (const memberIndex of group.memberIndices) {
            if (memberIndex >= 0 && memberIndex < groupingTexts.length && !topicNameByGroupingIndex[memberIndex]) {
              topicNameByGroupingIndex[memberIndex] = group.name;
            }
          }
        }
      }

      // split the shared topic assignments back to statements / action items / references by their offset in the list
      const actionOffset = keptStatements.length;
      const referenceOffset = actionOffset + keptActionItems.length;
      const statementTopicName = topicNameByGroupingIndex.slice(0, actionOffset);
      const actionTopicName = topicNameByGroupingIndex.slice(actionOffset, referenceOffset);
      const referenceTopicName = topicNameByGroupingIndex.slice(referenceOffset);

      // resolve each kept statement's status/date and embed it BEFORE the transaction - embeddings are slow openai
      // calls that must not run inside a db transaction, and statements with no topic group are dropped here
      const statementRows: {
        statement: (typeof keptStatements)[number];
        topicName: string;
        embedding: number[];
        occurredAt: Date;
        decisionStatus: ProjectDocumentDecisionStatus | null;
        implementationStatus: ProjectDocumentImplementationStatus | null;
      }[] = [];

      for (let index = 0; index < keptStatements.length; index++) {
        const statement = keptStatements[index];
        const topicName = statementTopicName[index];

        if (!topicName) {
          this.logger.warn(`Skipping statement with no topic group in ${projectDocument.path}`);
          continue;
        }

        const decisionStatus =
          (statement.type === ProjectDocumentStatementType.proposal ||
            statement.type === ProjectDocumentStatementType.decision) &&
          statement.decisionStatus &&
          decisionStatuses.includes(statement.decisionStatus as ProjectDocumentDecisionStatus)
            ? (statement.decisionStatus as ProjectDocumentDecisionStatus)
            : null;
        const implementationStatus =
          statement.implementationStatus &&
          implementationStatuses.includes(statement.implementationStatus as ProjectDocumentImplementationStatus)
            ? (statement.implementationStatus as ProjectDocumentImplementationStatus)
            : null;

        // use the statement's own inferred date, falling back to the document's date
        const inferredOccurredAt = statement.occurredAt ? new Date(statement.occurredAt) : null;
        const occurredAt =
          inferredOccurredAt && !Number.isNaN(inferredOccurredAt.getTime())
            ? inferredOccurredAt
            : projectDocument.occurredAt;

        const { embedding } = await this.openaiService.generateEmbedding({ input: statement.textDerived });

        statementRows.push({ statement, topicName, embedding, occurredAt, decisionStatus, implementationStatus });
      }

      // doc-topics come from the shared grouping, plus any option-topic names referenced by statements
      const referencedTopicNames = [
        ...topicNameByGroupingIndex.filter((name): name is string => !!name),
        ...keptStatements.map((statement) => statement.optionTopicName ?? ""),
      ].filter((name) => name.trim().length > 0);

      const topicNameToId = new Map<string, string>();

      // apply atomically: wipe the prior extraction and recreate it in one transaction, so a mid-write failure never
      // leaves the document with its old extraction deleted and the new one only partially written
      await this.prisma.$transaction(
        async (tx) => {
          await tx.projectDocumentStatement.deleteMany({ where: { projectDocumentId: projectDocument.id } });
          // only wipe ai-extracted occurrences; human-pinned rows survive re-extraction
          await tx.projectDocumentActionItem.deleteMany({
            where: { projectDocumentId: projectDocument.id, origin: ProjectDataOrigin.ai },
          });
          await tx.projectDocumentReference.deleteMany({ where: { fromProjectDocumentId: projectDocument.id } });
          await tx.projectDocumentTopic.deleteMany({ where: { projectDocumentId: projectDocument.id } });

          for (const name of new Set(referencedTopicNames)) {
            const topic = await tx.projectDocumentTopic.create({
              data: { projectId: projectDocument.projectId, projectDocumentId: projectDocument.id, name },
            });
            topicNameToId.set(name, topic.id);
          }

          for (const row of statementRows) {
            const projectDocumentTopicId = topicNameToId.get(row.topicName);

            if (!projectDocumentTopicId) {
              continue;
            }

            const created = await tx.projectDocumentStatement.create({
              data: {
                projectId: projectDocument.projectId,
                projectDocumentId: projectDocument.id,
                projectDocumentTopicId,
                textRaw: row.statement.textRaw,
                textDerived: row.statement.textDerived,
                type: row.statement.type as ProjectDocumentStatementType,
                decisionStatus: row.decisionStatus,
                implementationStatus: row.implementationStatus,
                optionTopicId: row.statement.optionTopicName
                  ? (topicNameToId.get(row.statement.optionTopicName) ?? null)
                  : null,
                reason: row.statement.reason,
                replacesPriorStatementText: row.statement.replacesPriorStatementText,
                actor: row.statement.actor,
                occurredAt: row.occurredAt,
                aiAnalysisOutput: JSON.stringify(row.statement),
              },
            });

            // textDerivedEmbedding is an unsupported halfvec column so it is written via raw sql
            await tx.$executeRaw`
              UPDATE "ProjectDocumentStatement"
              SET "textDerivedEmbedding" = ${`[${row.embedding.join(",")}]`}::halfvec
              WHERE id = ${created.id}::uuid
            `;
          }

          for (let index = 0; index < keptActionItems.length; index++) {
            const actionItem = keptActionItems[index];
            const topicName = actionTopicName[index];
            const status = actionItemStatuses.includes(actionItem.status as ProjectDocumentActionItemStatus)
              ? (actionItem.status as ProjectDocumentActionItemStatus)
              : ProjectDocumentActionItemStatus.open;

            await tx.projectDocumentActionItem.create({
              data: {
                projectId: projectDocument.projectId,
                projectDocumentId: projectDocument.id,
                projectDocumentTopicId: topicName ? (topicNameToId.get(topicName) ?? null) : null,
                owner: actionItem.owner,
                description: actionItem.description,
                expectedBy: actionItem.expectedBy,
                status,
                blockedOn: actionItem.blockedOn,
                reason: actionItem.reason,
                textRaw: actionItem.textRaw,
                aiAnalysisOutput: JSON.stringify(actionItem),
              },
            });
          }

          for (let index = 0; index < extraction.references.length; index++) {
            const reference = extraction.references[index];
            const topicName = referenceTopicName[index];

            await tx.projectDocumentReference.create({
              data: {
                projectId: projectDocument.projectId,
                fromProjectDocumentId: projectDocument.id,
                projectDocumentTopicId: topicName ? (topicNameToId.get(topicName) ?? null) : null,
                referentText: reference.referentText,
                expectation: reference.expectation,
                textRaw: reference.textRaw,
              },
            });
          }
        },
        { timeout: 30000 },
      );

      this.logger.log(
        `Extracted ${projectDocument.path}: kept ${statementRows.length}/${extraction.statements.length} statements, ${topicNameToId.size} topics, ${keptActionItems.length}/${extraction.actionItems.length} action items`,
      );
      return true;
    } catch (error) {
      // extraction is enrichment: log and leave the document indexed without statements rather than failing it
      this.logger.error(`Failed to extract document ${projectDocument.path}`, error);
      return false;
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

  async _extractCodeSymbols(
    projectId: string,
    repositoryFileId: string,
    metadata: Record<string, unknown>,
  ): Promise<number> {
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

    const treeNodes = buildDirectoryTreeFromCodeFilePaths(
      repositoryFiles.map((repositoryFile) => repositoryFile.fullPath),
    );

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
                findContainingDirectoryFullPath(repositoryFile.fullPath) === directoryNode.fullPath &&
                repositoryFile.summary,
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
