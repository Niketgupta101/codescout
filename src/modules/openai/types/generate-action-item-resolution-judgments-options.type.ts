import { ChatModel } from "openai/resources/shared";

export type GenerateActionItemResolutionJudgmentsOptions = {
  actionItems: {
    actionItem: string;
    candidates: { id: string; text: string; kind: "document" | "code" }[];
  }[];
  statuses: string[];
  model?: ChatModel;
};
