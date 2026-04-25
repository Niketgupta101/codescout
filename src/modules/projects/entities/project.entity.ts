import { Project } from "@prisma/client";
import { Expose } from "class-transformer";

@Expose()
export class ProjectEntity implements Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}
