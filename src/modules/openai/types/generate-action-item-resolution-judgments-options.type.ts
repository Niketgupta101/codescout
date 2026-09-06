import { ChatModel } from "openai/resources/shared";

export type GenerateActionItemResolutionJudgmentsOptions = {
  actionItems: {
    actionItem: string;
    // text is what the judge sees and what its quote is validated against, so it must carry every quotable source
    candidates: { id: string; text: string; kind: "document" | "code" }[];
  }[];
  model?: ChatModel;
};
