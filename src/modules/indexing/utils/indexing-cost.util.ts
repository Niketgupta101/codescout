import { Logger } from "@nestjs/common";
import {
  EMBEDDING_INPUT_PER_MILLION,
  EMBEDDING_MODEL,
  PRICING_QUOTED_AT,
  SUMMARY_INPUT_PER_MILLION,
  SUMMARY_MODEL,
  SUMMARY_OUTPUT_PER_MILLION,
  tokensToUsd,
} from "../../../utils/openai-pricing.util";
import { IndexingTokenAccumulator } from "../types/indexing-token-accumulator.type";

export const buildEmptyIndexingTokenAccumulator = (): IndexingTokenAccumulator => ({
  fileSummaryInputTokens: 0,
  fileSummaryOutputTokens: 0,
  fileSummaryCallCount: 0,
  fileEmbeddingInputTokens: 0,
  fileEmbeddingCallCount: 0,
  directorySummaryInputTokens: 0,
  directorySummaryOutputTokens: 0,
  directorySummaryCallCount: 0,
  projectSummaryInputTokens: 0,
  projectSummaryOutputTokens: 0,
  projectSummaryCallCount: 0,
});

// emits a multi-line breakdown so the cost is auditable via standard log search
// per-component lines let you compare estimate-vs-actual at a glance and tune EXPECTED_SUMMARY_OUTPUT_TOKENS
export const logIndexingCostBreakdown = ({
  logger,
  context,
  accumulator,
}: {
  logger: Logger;
  context: string;
  accumulator: IndexingTokenAccumulator;
}): void => {
  const fileSummaryInputCost = tokensToUsd(accumulator.fileSummaryInputTokens, SUMMARY_INPUT_PER_MILLION);
  const fileSummaryOutputCost = tokensToUsd(accumulator.fileSummaryOutputTokens, SUMMARY_OUTPUT_PER_MILLION);
  const fileEmbeddingCost = tokensToUsd(accumulator.fileEmbeddingInputTokens, EMBEDDING_INPUT_PER_MILLION);
  const directorySummaryInputCost = tokensToUsd(accumulator.directorySummaryInputTokens, SUMMARY_INPUT_PER_MILLION);
  const directorySummaryOutputCost = tokensToUsd(accumulator.directorySummaryOutputTokens, SUMMARY_OUTPUT_PER_MILLION);
  const projectSummaryInputCost = tokensToUsd(accumulator.projectSummaryInputTokens, SUMMARY_INPUT_PER_MILLION);
  const projectSummaryOutputCost = tokensToUsd(accumulator.projectSummaryOutputTokens, SUMMARY_OUTPUT_PER_MILLION);

  const fileSummaryTotal = fileSummaryInputCost + fileSummaryOutputCost;
  const directorySummaryTotal = directorySummaryInputCost + directorySummaryOutputCost;
  const projectSummaryTotal = projectSummaryInputCost + projectSummaryOutputCost;

  const grandTotal = fileSummaryTotal + fileEmbeddingCost + directorySummaryTotal + projectSummaryTotal;

  logger.log(
    [
      `Cost breakdown for ${context} (pricing as of ${PRICING_QUOTED_AT}, ${SUMMARY_MODEL} + ${EMBEDDING_MODEL}):`,
      `  File summaries:      ${accumulator.fileSummaryCallCount.toString().padStart(4)} calls, ${accumulator.fileSummaryInputTokens} input + ${accumulator.fileSummaryOutputTokens} output tokens, $${fileSummaryTotal.toFixed(6)}`,
      `  File embeddings:     ${accumulator.fileEmbeddingCallCount.toString().padStart(4)} calls, ${accumulator.fileEmbeddingInputTokens} tokens, $${fileEmbeddingCost.toFixed(6)}`,
      `  Directory summaries: ${accumulator.directorySummaryCallCount.toString().padStart(4)} calls, ${accumulator.directorySummaryInputTokens} input + ${accumulator.directorySummaryOutputTokens} output tokens, $${directorySummaryTotal.toFixed(6)}`,
      `  Project summary:     ${accumulator.projectSummaryCallCount.toString().padStart(4)} calls, ${accumulator.projectSummaryInputTokens} input + ${accumulator.projectSummaryOutputTokens} output tokens, $${projectSummaryTotal.toFixed(6)}`,
      `  Total: $${grandTotal.toFixed(6)}`,
    ].join("\n"),
  );
};
