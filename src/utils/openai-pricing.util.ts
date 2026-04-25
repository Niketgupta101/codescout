// openAI list pricing per million tokens, USD
// update PRICING_QUOTED_AT whenever values change

export const SUMMARY_MODEL = "gpt-4o-mini";
export const EMBEDDING_MODEL = "text-embedding-3-large";

export const SUMMARY_INPUT_PER_MILLION = 0.15;
export const SUMMARY_OUTPUT_PER_MILLION = 0.6;
export const EMBEDDING_INPUT_PER_MILLION = 0.13;

export const PRICING_QUOTED_AT = "2026-04-25";

// expected output tokens for our "under 300 words" summary prompt
// observed range is 350–500 with gpt-4o-mini, taking the high end as a conservative estimate
export const EXPECTED_SUMMARY_OUTPUT_TOKENS = 500;

// the embedding step embeds the summary, which has the same token count as the summary output
export const EXPECTED_EMBEDDING_INPUT_TOKENS = EXPECTED_SUMMARY_OUTPUT_TOKENS;

// guard against pathologically large files (lockfiles, generated bundles, etc.)
// files exceeding this token count are skipped during indexing, not truncated
export const MAX_INPUT_TOKENS_PER_FILE = 100_000;

export const tokensToUsd = (tokens: number, perMillion: number): number => (tokens / 1_000_000) * perMillion;
