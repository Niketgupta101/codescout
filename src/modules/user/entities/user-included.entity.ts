import { User } from "@prisma/client";
import { Expose } from "class-transformer";

export class UserIncludedEntity implements Pick<User, "id" | "name" | "firstName" | "lastName" | "email" | "deleted"> {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  firstName: string;

  @Expose()
  lastName: string;

  @Expose()
  email: string;

  @Expose()
  deleted: boolean;
}
