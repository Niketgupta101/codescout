import { Expose } from "class-transformer";

@Expose()
export class RepositoryIndexCostEstimatePricingEntity {
  summaryModel: string;
  summaryInputPerMillion: number;
  summaryOutputPerMillion: number;
  embeddingModel: string;
  embeddingInputPerMillion: number;
  quotedAt: string;
}
