import { ChatModel } from "openai/resources/shared";

export type GenerateDocumentExtractionOptions = {
  content: string;
  name: string;
  // the document's inferred genre, used to steer extraction
  documentType: string;
  // allowed enum values the model must choose from (reconciler-only values excluded by the caller)
  enums: {
    statementType: string[];
    decisionStatus: string[];
    implementationStatus: string[];
    actionItemStatus: string[];
  };
  model?: ChatModel;
};
