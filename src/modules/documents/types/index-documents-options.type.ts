import { DocumentType } from "@prisma/client";

export type IndexDocumentsOptions = {
  files: Express.Multer.File[];
  documentType: DocumentType;
};
