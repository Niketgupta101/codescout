import { Expose } from "class-transformer";

@Expose()
export class RepositoryIndexCostEstimateFileSkippedEntity {
  path: string;
  reason: string;
}
