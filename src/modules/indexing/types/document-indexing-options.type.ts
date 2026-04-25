import { DocumentFormat } from "@prisma/client";

export type DocumentIndexingOptions = {
  path: string;
  format: DocumentFormat;
  originalName?: string;
  documentId?: string;
};
