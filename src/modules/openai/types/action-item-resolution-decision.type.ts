// a decisive judgment about one evidence candidate, after its id and its quote have both been validated.
// candidates the judge found merely related produce no decision at all
export type ActionItemResolutionDecision = {
  candidateId: string;
  candidateKind: "document" | "code";
  verdict: "supports" | "contradicts";
  // verbatim span from the candidate, checked mechanically before this decision is returned
  evidenceQuote: string;
  reason: string;
  confidence: number;
};
