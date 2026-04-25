import { Controller, Get, Param, Delete, Post, Body } from "@nestjs/common";
import { IndexingCostService } from "../indexing/indexing-cost.service";
import { IndexRepositoryCostEstimateDto } from "./dtos/index-repository-cost-estimate.dto";
import { IndexRepositoryDto } from "./dtos/index-repository.dto";
import { RepositoriesService } from "./repositories.service";
import { Entity } from "src/decorators/entity.decorator";
import { RepositoryEntity } from "./entities/repository.entity";
import { RepositoryIndexCostEstimateEntity } from "./entities/repository-index-cost-estimate.entity";
import { RepositoryPageEntity } from "./entities/repository-page.entity";

@Controller("projects/:projectId/repositories")
@Entity({ type: RepositoryEntity })
export class RepositoriesController {
  constructor(
    readonly repositoriesService: RepositoriesService,
    readonly indexingCostService: IndexingCostService,
  ) {}

  @Post()
  async index(@Param("projectId") projectId: string, @Body() indexRepositoryDto: IndexRepositoryDto) {
    return this.repositoriesService.index(projectId, indexRepositoryDto);
  }

  @Post("all/index-cost-estimate")
  @Entity({ type: RepositoryIndexCostEstimateEntity })
  async indexCostEstimate(@Body() indexRepositoryCostEstimateDto: IndexRepositoryCostEstimateDto) {
    return this.indexingCostService.repositoryIndexCostEstimate(indexRepositoryCostEstimateDto);
  }

  @Get()
  async findAll(@Param("projectId") projectId: string) {
    return this.repositoriesService.findAll(projectId);
  }

  @Get(":repositoryId")
  @Entity({ type: RepositoryPageEntity })
  async findOne(@Param("repositoryId") repositoryId: string) {
    return this.repositoriesService.findOne(repositoryId);
  }

  @Delete(":repositoryId")
  async remove(@Param("repositoryId") repositoryId: string) {
    return this.repositoriesService.remove(repositoryId);
  }

  @Post(":repositoryId/index/all/cancel")
  async cancelIndexing(@Param("repositoryId") repositoryId: string) {
    return this.repositoriesService.cancelIndexing(repositoryId);
  }
}
