import { Expose } from "class-transformer";
import type { ProjectFolderProvider } from "@prisma/client";

@Expose()
export class ProjectFolderEntity {
  id: string;
  projectId: string;
  name: string;
  provider: ProjectFolderProvider;
  providerId: string;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
