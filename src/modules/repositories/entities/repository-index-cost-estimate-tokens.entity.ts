import { Expose } from "class-transformer";

@Expose()
export class RepositoryIndexCostEstimateTokensEntity {
  summaryInputExact: number;
  summaryOutputEstimated: number;
  embeddingInputEstimated: number;
}
