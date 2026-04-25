import { PageEntity } from "src/modules/common/entities/page.entity";
import { NestedArray } from "src/decorators/nested-array.decorator";
import { ProjectEntity } from "./project.entity";

export class ProjectPageEntity extends PageEntity<ProjectEntity> {
  @NestedArray(() => ProjectEntity)
  items: ProjectEntity[];
}
