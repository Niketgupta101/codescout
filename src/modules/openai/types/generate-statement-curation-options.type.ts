import { ChatModel } from "openai/resources/shared";
import { GenerateDocumentExtractionOptions } from "./generate-document-extraction-options.type";
import { OpenAiDocumentExtraction } from "./openai-document-extraction.type";

export type GenerateStatementCurationOptions = {
  statements: OpenAiDocumentExtraction["statements"];
  name: string;
  projectContext?: string;
  documentType: string;
  enums: Pick<GenerateDocumentExtractionOptions["enums"], "statementType" | "decisionStatus" | "implementationStatus">;
  model?: ChatModel;
};
