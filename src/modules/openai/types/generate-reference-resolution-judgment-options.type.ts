import { ChatModel } from "openai/resources/shared";

export type GenerateReferenceResolutionJudgmentOptions = {
  // what the source document points to, e.g. "Phase 2 plan v1"
  referentText: string;
  // what the source document assumes is true about the referent
  expectation: string;
  // ordered candidates; documents precede statements to preserve the existing resolution precedence
  candidates: { id: string; text: string; kind: "document" | "statement" }[];
  model?: ChatModel;
};
