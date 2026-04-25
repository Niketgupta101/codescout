import { Expose } from "class-transformer";

@Expose()
export class RepositoryIndexCostEstimateCostEntity {
  summaryInput: number;
  summaryOutputEstimated: number;
  embeddingEstimated: number;
  total: number;
}
