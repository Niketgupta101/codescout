import { Injectable, Logger } from "@nestjs/common";
// project tsconfig uses classic node module resolution (not node16/bundler), so we import the
// encoding-specific build via the on-disk path rather than the package.json exports subpath
import { encode } from "gpt-tokenizer/cjs/encoding/o200k_base";
import { GithubService } from "../github/github.service";
import { OpenAIService, SUMMARY_SYSTEM_PROMPT } from "../openai/openai.service";
import {
  EMBEDDING_INPUT_PER_MILLION,
  EMBEDDING_MODEL,
  EXPECTED_EMBEDDING_INPUT_TOKENS,
  EXPECTED_SUMMARY_OUTPUT_TOKENS,
  MAX_INPUT_TOKENS_PER_FILE,
  PRICING_QUOTED_AT,
  SUMMARY_INPUT_PER_MILLION,
  SUMMARY_MODEL,
  SUMMARY_OUTPUT_PER_MILLION,
  tokensToUsd,
} from "../../utils/openai-pricing.util";
import { RepositoryIndexCostEstimate } from "./types/repository-index-cost-estimate.type";
import { RepositoryIndexCostEstimateOptions } from "./types/repository-index-cost-estimate-options.type";
import { buildRepositoryIndexFileFilter } from "./utils/repository-file-filter.util";

@Injectable()
export class IndexingCostService {
  readonly logger = new Logger(IndexingCostService.name);

  constructor(
    readonly githubService: GithubService,
    readonly openaiService: OpenAIService,
  ) {}

  /**
   * Estimates the OpenAI cost of indexing a repository without performing any indexing or LLM calls.
   * Clones the repo, applies the same file filter as real indexing, tokenizes each file's prompt locally,
   * and applies current pricing. Cleans up the clone before returning.
   * @param options - Same shape as repositoryIndex (url, branch, includeTests, authToken)
   * @returns Token counts and USD cost broken down by component
   */
  async repositoryIndexCostEstimate(
    options: RepositoryIndexCostEstimateOptions,
  ): Promise<RepositoryIndexCostEstimate> {
    const { url, branch = "main", includeTests = false, authToken } = options;
    const startTime = Date.now();

    this.logger.log(`Estimating index cost for ${url} (branch: ${branch})`);

    let clonePath: string | null = null;

    try {
      clonePath = await this.githubService.cloneRepo({ url, branch, depth: 1, authToken });

      const files = await this.githubService.listCodeFiles(clonePath, buildRepositoryIndexFileFilter({ includeTests }));

      this.logger.log(`Found ${files.length} candidate files for cost estimation`);

      const filesByLanguageMap = new Map<string, number>();
      const filesSkipped: { path: string; reason: string }[] = [];
      let summaryInputExact = 0;
      let acceptedFiles = 0;

      for (const file of files) {
        const promptText = SUMMARY_SYSTEM_PROMPT + this.openaiService._buildSummaryPrompt(file.language, file.path, file.content);
        const tokenCount = encode(promptText).length;

        if (tokenCount > MAX_INPUT_TOKENS_PER_FILE) {
          filesSkipped.push({
            path: file.path,
            reason: `exceeds ${MAX_INPUT_TOKENS_PER_FILE.toLocaleString()} tokens (file is ${tokenCount.toLocaleString()})`,
          });
          continue;
        }

        summaryInputExact += tokenCount;
        filesByLanguageMap.set(file.language, (filesByLanguageMap.get(file.language) ?? 0) + 1);
        acceptedFiles++;
      }

      const filesByLanguage = [...filesByLanguageMap.entries()]
        .map(([language, count]) => ({ language, count }))
        .sort((a, b) => b.count - a.count);

      const summaryOutputEstimated = acceptedFiles * EXPECTED_SUMMARY_OUTPUT_TOKENS;
      const embeddingInputEstimated = acceptedFiles * EXPECTED_EMBEDDING_INPUT_TOKENS;

      const summaryInputCost = tokensToUsd(summaryInputExact, SUMMARY_INPUT_PER_MILLION);
      const summaryOutputCost = tokensToUsd(summaryOutputEstimated, SUMMARY_OUTPUT_PER_MILLION);
      const embeddingCost = tokensToUsd(embeddingInputEstimated, EMBEDDING_INPUT_PER_MILLION);

      const durationMs = Date.now() - startTime;
      this.logger.log(
        `Cost estimate complete in ${durationMs}ms: ${acceptedFiles} files, ${summaryInputExact} input tokens, $${(summaryInputCost + summaryOutputCost + embeddingCost).toFixed(4)} total`,
      );

      return {
        totalFiles: acceptedFiles,
        filesByLanguage,
        filesSkipped,
        tokens: {
          summaryInputExact,
          summaryOutputEstimated,
          embeddingInputEstimated,
        },
        cost: {
          summaryInput: summaryInputCost,
          summaryOutputEstimated: summaryOutputCost,
          embeddingEstimated: embeddingCost,
          total: summaryInputCost + summaryOutputCost + embeddingCost,
        },
        pricing: {
          summaryModel: SUMMARY_MODEL,
          summaryInputPerMillion: SUMMARY_INPUT_PER_MILLION,
          summaryOutputPerMillion: SUMMARY_OUTPUT_PER_MILLION,
          embeddingModel: EMBEDDING_MODEL,
          embeddingInputPerMillion: EMBEDDING_INPUT_PER_MILLION,
          quotedAt: PRICING_QUOTED_AT,
        },
        notes: [
          `Input tokens are exact (counted via gpt-tokenizer o200k_base, the encoding used by ${SUMMARY_MODEL}).`,
          `Summary output tokens are estimated at ${EXPECTED_SUMMARY_OUTPUT_TOKENS} per file based on the "under 300 words" prompt; actual ±20%.`,
          `Embedding input is the summary text — same estimate as summary output.`,
          `Files exceeding ${MAX_INPUT_TOKENS_PER_FILE.toLocaleString()} tokens are skipped during real indexing too.`,
        ],
      };
    } finally {
      if (clonePath) {
        await this.githubService.cleanup(clonePath);
      }
    }
  }
}
