import { Expose } from "class-transformer";
import { ProjectFolderImportStatus } from "@prisma/client";
import { NestedArray } from "src/decorators/nested-array.decorator";
import { ProjectFolderImportIssueEntity } from "./project-folder-import-issue.entity";

@Expose()
export class ProjectFolderImportEntity {
  id: string;
  projectId: string;
  projectFolderId: string;
  status: ProjectFolderImportStatus;
  filesTotal: number;
  filesProcessed: number;
  documentsChanged: number;
  currentPath: string | null;

  @NestedArray(() => ProjectFolderImportIssueEntity)
  issues: ProjectFolderImportIssueEntity[];

  error: string | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
