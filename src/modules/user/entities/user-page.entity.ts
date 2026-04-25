import { PageEntity } from "src/modules/common/entities/page.entity";
import { UserEntity } from "./user.entity";
import { NestedArray } from "src/decorators/nested-array.decorator";

export class UserPageEntity extends PageEntity<UserEntity> {
  @NestedArray(() => UserEntity)
  items: UserEntity[];
}
