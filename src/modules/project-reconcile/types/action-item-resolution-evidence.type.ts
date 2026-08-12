export type ActionItemResolutionEvidence = {
  candidates: { id: string; text: string; kind: "document" | "code" }[];
  documentIdByCandidateId: Map<string, string>;
};
