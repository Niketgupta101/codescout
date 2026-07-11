import { Expose } from "class-transformer";

@Expose()
export class ProjectReconcileResultEntity {
  projectId: string;
  topicsCreated: number;
  topicsMatched: number;
  statementsReconciled: number;
  supersessionsLinked: number;
}
