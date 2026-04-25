import { Exclude, Expose, Type } from "class-transformer";
import { UserPasswordEntity } from "./user-password.entity";
import { User } from "@prisma/client";

@Exclude()
export class UserEntity implements User {
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
  enabled: boolean;

  @Expose()
  approved: boolean;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;

  @Expose()
  deleted: boolean;

  @Expose()
  deletedAt: Date | null;

  @Expose()
  get inviteAccepted() {
    return this.password !== undefined ? !!this.password : undefined;
  }

  @Expose()
  @Type(() => UserPasswordEntity)
  password?: UserPasswordEntity | null;
}
