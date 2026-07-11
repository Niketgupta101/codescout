import { ChatModel } from "openai/resources/shared";

export type GenerateStatementFilterOptions = {
  // extracted statement claims (textDerived) to curate for the knowledge base
  statements: string[];
  name: string;
  documentType: string;
  model?: ChatModel;
};
