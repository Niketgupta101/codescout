import { PageEntity } from "src/modules/common/entities/page.entity";
import { NestedArray } from "src/decorators/nested-array.decorator";
import { ProjectFolderEntity } from "./project-folder.entity";

export class ProjectFolderPageEntity extends PageEntity<ProjectFolderEntity> {
  @NestedArray(() => ProjectFolderEntity)
  items: ProjectFolderEntity[];
}
