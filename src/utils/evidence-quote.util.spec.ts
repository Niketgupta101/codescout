import { evidenceQuoteOccursIn, normalizeEvidenceQuote } from "./evidence-quote.util";

describe("normalizeEvidenceQuote", () => {
  it("collapses whitespace runs including non-breaking spaces", () => {
    expect(normalizeEvidenceQuote("Marc Müller   countersigned\n\tthe contract")).toBe(
      "marc müller countersigned the contract",
    );
  });

  it("folds typographic punctuation to ascii", () => {
    expect(normalizeEvidenceQuote("“Vertrag” — it’s signed…")).toBe('"vertrag" - it\'s signed...');
  });

  it("treats both unicode composition forms of an umlaut as equal", () => {
    const composed = "Müller";
    const decomposed = "Müller";

    expect(composed).not.toBe(decomposed);
    expect(normalizeEvidenceQuote(composed)).toBe(normalizeEvidenceQuote(decomposed));
  });

  it("lowercases without expanding ß, so the comparison stays symmetric", () => {
    expect(normalizeEvidenceQuote("Straße")).toBe("straße");
  });

  it("strips a line-number gutter from every line of an excerpt", () => {
    expect(normalizeEvidenceQuote("   42| const parsed = parseDocx(file);\n   43| return parsed;")).toBe(
      "const parsed = parsedocx(file); return parsed;",
    );
  });
});

describe("evidenceQuoteOccursIn", () => {
  const statement = "Marc Müller countersigned the MP-Logistik project contract and returned the countersigned file.";

  it("accepts a verbatim quote", () => {
    expect(evidenceQuoteOccursIn({ quote: "countersigned the MP-Logistik project contract", sources: [statement] })).toBe(
      true,
    );
  });

  it("accepts a quote that was re-wrapped across lines", () => {
    expect(
      evidenceQuoteOccursIn({ quote: "countersigned the\n  MP-Logistik project\ncontract", sources: [statement] }),
    ).toBe(true);
  });

  it("rejects a paraphrase", () => {
    expect(evidenceQuoteOccursIn({ quote: "Marc signed the contract for MP-Logistik", sources: [statement] })).toBe(
      false,
    );
  });

  it("rejects a quote shorter than the minimum, which would match almost anything", () => {
    expect(evidenceQuoteOccursIn({ quote: "contract", sources: [statement] })).toBe(false);
  });

  it("rejects a quote longer than the maximum", () => {
    const tooLong = "x".repeat(301);

    expect(evidenceQuoteOccursIn({ quote: tooLong, sources: [tooLong] })).toBe(false);
  });

  it("rejects a quote that belongs to a different candidate", () => {
    const otherCandidate = "The Soloplan integration remains blocked on Marvin.";

    expect(evidenceQuoteOccursIn({ quote: "remains blocked on Marvin", sources: [statement] })).toBe(false);
    expect(evidenceQuoteOccursIn({ quote: "remains blocked on Marvin", sources: [otherCandidate] })).toBe(true);
  });

  it("matches against any of the texts the candidate was rendered from", () => {
    const textDerived = "Marc Müller countersigned the contract.";
    const textRaw = "Anbei gegengezeichnet zurück.";

    expect(evidenceQuoteOccursIn({ quote: "gegengezeichnet zurück", sources: [textDerived, textRaw] })).toBe(true);
  });
});
