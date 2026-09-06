export type ActionItemResolutionEvidence = {
  candidates: { id: string; text: string; kind: "document" | "code" }[];
  documentIdByCandidateId: Map<string, string>;
  // "kind:id:contentHash" per candidate, feeding the digest that decides whether this item needs re-judging
  digestEntries: string[];
};
