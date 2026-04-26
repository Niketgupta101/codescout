import { Expose, Type } from "class-transformer";
import { UserApiKeyEntity } from "./user-api-key.entity";

@Expose()
export class UserApiKeyWithSecretEntity {
  @Type(() => UserApiKeyEntity)
  apiKey: UserApiKeyEntity;

  // full key value, returned ONCE on creation and never again — caller must store it now
  key: string;
}
