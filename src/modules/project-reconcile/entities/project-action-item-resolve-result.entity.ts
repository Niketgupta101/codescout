import { Expose } from "class-transformer";

@Expose()
export class ProjectActionItemResolveResultEntity {
  projectId: string;
  actionItemsExamined: number;
  actionItemsJudged: number;
  actionItemsSkipped: number;
  actionItemsResolved: number;
  actionItemsReverted: number;
  actionItemsConflicted: number;
  quoteRejections: number;
}
