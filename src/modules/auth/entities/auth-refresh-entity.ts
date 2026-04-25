import { Expose } from "class-transformer";
import { AuthEntity } from "./auth.entity";

@Expose()
export class AuthRefreshEntity extends AuthEntity {}
