import { ChatModel } from "openai/resources/shared";

export type GenerateSummaryOptions = {
  content: string;
  language: string;
  filePath: string;
  model?: ChatModel;
};
