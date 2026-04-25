import { Expose } from "class-transformer";

@Expose()
export class RepositoryIndexCostEstimateLanguageCountEntity {
  language: string;
  count: number;
}
