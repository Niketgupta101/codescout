import { Expose, Type } from "class-transformer";
import { RepositoryIndexCostEstimateCostEntity } from "./repository-index-cost-estimate-cost.entity";
import { RepositoryIndexCostEstimateFileSkippedEntity } from "./repository-index-cost-estimate-file-skipped.entity";
import { RepositoryIndexCostEstimateLanguageCountEntity } from "./repository-index-cost-estimate-language-count.entity";
import { RepositoryIndexCostEstimatePricingEntity } from "./repository-index-cost-estimate-pricing.entity";
import { RepositoryIndexCostEstimateTokensEntity } from "./repository-index-cost-estimate-tokens.entity";

@Expose()
export class RepositoryIndexCostEstimateEntity {
  totalFiles: number;
  totalDirectories: number;

  @Type(() => RepositoryIndexCostEstimateLanguageCountEntity)
  filesByLanguage: RepositoryIndexCostEstimateLanguageCountEntity[];

  @Type(() => RepositoryIndexCostEstimateFileSkippedEntity)
  filesSkipped: RepositoryIndexCostEstimateFileSkippedEntity[];

  @Type(() => RepositoryIndexCostEstimateTokensEntity)
  tokens: RepositoryIndexCostEstimateTokensEntity;

  @Type(() => RepositoryIndexCostEstimateCostEntity)
  cost: RepositoryIndexCostEstimateCostEntity;

  @Type(() => RepositoryIndexCostEstimatePricingEntity)
  pricing: RepositoryIndexCostEstimatePricingEntity;

  notes: string[];
}
