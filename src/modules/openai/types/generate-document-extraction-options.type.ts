import { ChatModel } from "openai/resources/shared";

export type GenerateDocumentExtractionOptions = {
  content: string;
  // optional dedicated action source (e.g. a structured Next Steps section); defaults to content
  actionContent?: string;
  name: string;
  // project-level scope used to reject tangential content in mixed documents and meeting transcripts
  projectContext?: string;
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
