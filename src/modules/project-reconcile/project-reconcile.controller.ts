import { Controller, Post, Param, Query } from "@nestjs/common";
import { ProjectReconcileService } from "./project-reconcile.service";
import { Entity } from "src/decorators/entity.decorator";
import { ProjectReconcileResultEntity } from "./entities/project-reconcile-result.entity";
import { ProjectStatementThreadResultEntity } from "./entities/project-statement-thread-result.entity";
import { ProjectActionItemResolveResultEntity } from "./entities/project-action-item-resolve-result.entity";

@Controller("project/:projectId/reconcile")
@Entity({ type: ProjectReconcileResultEntity })
export class ProjectReconcileController {
  constructor(readonly projectReconcileService: ProjectReconcileService) {}

  @Post()
  async reconcile(@Param("projectId") projectId: string) {
    const result = await this.projectReconcileService.canonicalize(projectId);

    return { projectId, ...result };
  }

  @Post("thread")
  @Entity({ type: ProjectStatementThreadResultEntity })
  async projectStatementThread(@Param("projectId") projectId: string) {
    const result = await this.projectReconcileService.threadStatements(projectId);

    return { projectId, ...result };
  }

  @Post("action-items")
  @Entity({ type: ProjectActionItemResolveResultEntity })
  async projectActionItemResolve(
    @Param("projectId") projectId: string,
    @Query("force") force?: string,
    @Query("dryRun") dryRun?: string,
  ) {
    const result = await this.projectReconcileService.resolveActionItemStatuses(projectId, {
      force: force === "true",
      dryRun: dryRun === "true",
    });

    return { projectId, ...result };
  }
}
