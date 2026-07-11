import { ChatModel } from "openai/resources/shared";

export type GenerateDocumentClassificationOptions = {
  content: string;
  name: string;
  // the allowed genres the model must choose from (the ProjectDocumentType enum values)
  types: string[];
  model?: ChatModel;
};
