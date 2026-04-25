import { PageEntity } from "src/modules/common/entities/page.entity";
import { NestedArray } from "src/decorators/nested-array.decorator";
import { RepositoryEntity } from "./repository.entity";

export class RepositoryPageEntity extends PageEntity<RepositoryEntity> {
  @NestedArray(() => RepositoryEntity)
  items: RepositoryEntity[];
}
