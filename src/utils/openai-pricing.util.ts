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

// directory-summary input includes file summaries + child directory summaries + ~150 token prompt overhead
// rough average across directories - actual depends on how many files/children each directory has
export const EXPECTED_DIRECTORY_SUMMARY_INPUT_TOKENS = 2500;

// directory-summary prompt asks for "under 150 words" - typical output is ~300–400 tokens
export const EXPECTED_DIRECTORY_SUMMARY_OUTPUT_TOKENS = 400;

// project-summary input is the top-level directory summaries - usually 5–15 of them at ~400 tokens each + prompt overhead
export const EXPECTED_PROJECT_SUMMARY_INPUT_TOKENS = 5000;

// project-summary prompt asks for "under 250 words" - typical output is ~500–600 tokens
export const EXPECTED_PROJECT_SUMMARY_OUTPUT_TOKENS = 600;

// guard against pathologically large files (lockfiles, generated bundles, etc.)
// files exceeding this token count are skipped during indexing, not truncated
export const MAX_INPUT_TOKENS_PER_FILE = 100_000;

export const tokensToUsd = (tokens: number, perMillion: number): number => (tokens / 1_000_000) * perMillion;
