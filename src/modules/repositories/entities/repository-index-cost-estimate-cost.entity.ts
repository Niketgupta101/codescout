import { Expose } from "class-transformer";

@Expose()
export class RepositoryIndexCostEstimateCostEntity {
  summaryInput: number;
  summaryOutputEstimated: number;
  embeddingEstimated: number;
  directorySummaryEstimated: number;
  projectSummaryEstimated: number;
  total: number;
}
