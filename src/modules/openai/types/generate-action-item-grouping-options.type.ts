import { ChatModel } from "openai/resources/shared";

export type GenerateActionItemGroupingOptions = {
  actionItems: {
    description: string;
    owner: string;
    status: string;
    candidateActionItemIds: string[];
  }[];
  existingActionItems: { id: string; title: string; description: string; owner: string | null }[];
  model?: ChatModel;
};
