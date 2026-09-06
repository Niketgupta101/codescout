// a resolution verdict must cite a span copied verbatim out of the evidence it names. the check is deliberately
// mechanical: it proves the model read the candidate we handed it, and no similarity score can be argued with.
// what it does NOT prove is that the candidate supports the conclusion - that is the judge's and the conflict
// branch's job

export const EVIDENCE_QUOTE_MIN_LENGTH = 12;
export const EVIDENCE_QUOTE_MAX_LENGTH = 300;

// models re-emit typographic punctuation inconsistently, which is the largest source of false rejections
const PUNCTUATION_FOLDING: [RegExp, string][] = [
  [/[‘’‚‛′]/g, "'"],
  [/[“”„‟″«»]/g, '"'],
  [/[‐‑‒–—―−]/g, "-"],
  [/[…]/g, "..."],
];

// line-numbered excerpts are rendered with a "%5d| " gutter, so a quote copied with or without it must match
const LINE_NUMBER_GUTTER = /^[ \t]*\d+[ \t]*\|[ \t]?/gm;

/**
 * Normalizes text so a verbatim quote survives re-wrapping and punctuation substitution but not paraphrase.
 * @param text - the quote or the candidate text it is claimed to come from
 * @returns The normalized form, for substring comparison only.
 */
export const normalizeEvidenceQuote = (text: string): string => {
  let normalized = text.normalize("NFKC");

  for (const [pattern, replacement] of PUNCTUATION_FOLDING) {
    normalized = normalized.replace(pattern, replacement);
  }

  return (
    normalized
      .replace(LINE_NUMBER_GUTTER, "")
      // every unicode space, including NBSP and the narrow no-break space, collapses to one plain space
      .replace(/\s+/g, " ")
      // lowercase only; uppercasing German ß to SS is lossy and would make the comparison asymmetric
      .toLocaleLowerCase("en")
      .trim()
  );
};

/**
 * Checks that a cited quote actually occurs in one of the texts the judge was shown.
 * @param evidenceQuoteInput - the quote, and every text the chosen candidate was rendered from
 * @returns True when the quote is present verbatim and within the allowed length.
 */
export const evidenceQuoteOccursIn = (evidenceQuoteInput: { quote: string; sources: string[] }): boolean => {
  const normalizedQuote = normalizeEvidenceQuote(evidenceQuoteInput.quote);

  if (
    normalizedQuote.length < EVIDENCE_QUOTE_MIN_LENGTH ||
    normalizedQuote.length > EVIDENCE_QUOTE_MAX_LENGTH
  ) {
    return false;
  }

  return evidenceQuoteInput.sources.some((source) => normalizeEvidenceQuote(source).includes(normalizedQuote));
};
