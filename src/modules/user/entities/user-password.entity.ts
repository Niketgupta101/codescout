import { Exclude, Expose } from "class-transformer";
import { UserPassword } from "@prisma/client";

@Exclude()
export class UserPasswordEntity implements Pick<UserPassword, "id" | "lastChangedAt"> {
  @Expose()
  id: string;

  @Expose()
  lastChangedAt: Date;
}
