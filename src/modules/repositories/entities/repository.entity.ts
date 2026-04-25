import { Repository, RepositoryStatus, RepositoryType } from "@prisma/client";
import { JsonValue } from "@prisma/client/runtime/library";
import { Expose } from "class-transformer";

@Expose()
export class RepositoryEntity implements Repository {
  id: string;
  projectId: string;
  name: string;
  url: string;
  branch: string;
  lastCommitHash: string | null;
  status: RepositoryStatus;
  type: RepositoryType;
  metadata: JsonValue;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}
