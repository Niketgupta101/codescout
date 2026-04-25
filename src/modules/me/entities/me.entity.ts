import { Exclude, Expose } from "class-transformer";
import { User } from "@prisma/client";

@Exclude()
export class MeEntity implements User {
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
  createdAt: Date;

  @Expose()
  updatedAt: Date;

  @Expose()
  deleted: boolean;

  @Expose()
  deletedAt: Date | null;
}
