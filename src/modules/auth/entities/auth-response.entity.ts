import { Expose, Type } from "class-transformer";
import { AuthEntity } from "./auth.entity";

@Expose()
export class AuthResponseEntity {
  @Type(() => AuthEntity)
  auth?: AuthEntity;
}
