import { ChatModel } from "openai/resources/shared";

export type GenerateStatementSupersessionJudgmentOptions = {
  // the fixed side of the comparison
  statement: string;
  // ordered nearest-first candidates on the other side
  candidates: { id: string; text: string }[];
  candidateRole: "prior" | "new";
  // the new statement's local hint about what it changes; omitted for hintless cross-document detection
  hint?: string;
  model?: ChatModel;
};
