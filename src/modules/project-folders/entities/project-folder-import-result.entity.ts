import { Expose } from "class-transformer";
import { NestedArray } from "src/decorators/nested-array.decorator";
import { ProjectFolderImportIssueEntity } from "./project-folder-import-issue.entity";

@Expose()
export class ProjectFolderImportResultEntity {
  projectFolderId: string;

  @NestedArray(() => ProjectFolderImportIssueEntity)
  issues: ProjectFolderImportIssueEntity[];
}
