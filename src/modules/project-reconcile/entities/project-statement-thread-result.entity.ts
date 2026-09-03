import { Expose } from "class-transformer";

@Expose()
export class ProjectStatementThreadResultEntity {
  projectId: string;
  statementsReconciled: number;
  supersessionsLinked: number;
}
