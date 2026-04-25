import { RepositoryType } from "@prisma/client";

export type RepositoryIndexingOptions = {
  url: string;
  branch?: string;
  repositoryType?: RepositoryType;
  includeTests?: boolean;
  authToken?: string;
};
