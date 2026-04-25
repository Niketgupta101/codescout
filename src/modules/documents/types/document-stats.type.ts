import type { DocumentStatus } from "@prisma/client";

export type DocumentStats = {
  document: {
    id: string;
    projectId: string;
    filename: string;
    format: string;
    status: DocumentStatus;
    createdAt: Date;
    updatedAt: Date;
  };
  fileCount: number;
  symbolCount: number;
};
