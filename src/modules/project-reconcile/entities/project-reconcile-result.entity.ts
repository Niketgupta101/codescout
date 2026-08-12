import { Expose } from "class-transformer";

@Expose()
export class ProjectReconcileResultEntity {
  projectId: string;
  correctionsApplied: number;
  topicsCreated: number;
  topicsMatched: number;
  actionItemsCreated: number;
  actionItemsMatched: number;
}
