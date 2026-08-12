import { ChatModel } from "openai/resources/shared";
import { GenerateDocumentExtractionOptions } from "./generate-document-extraction-options.type";
import { OpenAiDocumentExtraction } from "./openai-document-extraction.type";

export type GenerateActionItemCurationOptions = {
  actionItems: OpenAiDocumentExtraction["actionItems"];
  name: string;
  projectContext?: string;
  documentType: string;
  enums: Pick<GenerateDocumentExtractionOptions["enums"], "actionItemStatus">;
  model?: ChatModel;
};
