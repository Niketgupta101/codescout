import { Expose, Type } from "class-transformer";
import { RepositoryEntity } from "./respository.entity";

@Expose()
export class RepositoryStatsEntity {
  @Type(() => RepositoryEntity)
  repository: RepositoryEntity;

  fileCount: number;
  symbolCount: number;
}
