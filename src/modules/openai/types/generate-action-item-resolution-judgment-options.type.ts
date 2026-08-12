import { ChatModel } from "openai/resources/shared";

export type GenerateActionItemResolutionJudgmentOptions = {
  // the canonical action item under judgment (title + description)
  actionItem: string;
  // ordered evidence candidates; later-document evidence precedes code evidence
  candidates: { id: string; text: string; kind: "document" | "code" }[];
  // allowed ProjectDocumentActionItemStatus values the judgment may return
  statuses: string[];
  model?: ChatModel;
};
