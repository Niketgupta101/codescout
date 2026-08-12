import { encode, decode } from "gpt-tokenizer/cjs/encoding/o200k_base";

/**
 * Splits text into chunks no larger than maxTokens, measured with the o200k_base encoding (gpt-4o family).
 * Splitting is on token boundaries; no overlap, so merged chunk results don't duplicate spans.
 * @param chunkTextByTokensInput - the text to split and the per-chunk token budget
 * @returns The ordered chunks; a single chunk when the text already fits, or none when empty.
 */
export function chunkTextByTokens(chunkTextByTokensInput: { text: string; maxTokens: number }): string[] {
  const { text, maxTokens } = chunkTextByTokensInput;
  const tokens = encode(text);

  if (tokens.length <= maxTokens) {
    return text ? [text] : [];
  }

  const chunkSize = Math.max(1, maxTokens);
  const chunks: string[] = [];

  // slice the token ids into chunks and decode each back to text
  for (let start = 0; start < tokens.length; start += chunkSize) {
    chunks.push(decode(tokens.slice(start, start + chunkSize)));
  }

  return chunks;
}
