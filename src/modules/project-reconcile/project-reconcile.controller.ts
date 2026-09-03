import { Controller, Post, Param } from "@nestjs/common";
import { ProjectReconcileService } from "./project-reconcile.service";
import { Entity } from "src/decorators/entity.decorator";
import { ProjectReconcileResultEntity } from "./entities/project-reconcile-result.entity";
import { ProjectStatementThreadResultEntity } from "./entities/project-statement-thread-result.entity";

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
}
