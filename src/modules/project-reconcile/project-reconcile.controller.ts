import { Controller, Post, Param } from "@nestjs/common";
import { ProjectReconcileService } from "./project-reconcile.service";
import { Entity } from "src/decorators/entity.decorator";
import { ProjectReconcileResultEntity } from "./entities/project-reconcile-result.entity";

@Controller("project/:projectId/reconcile")
@Entity({ type: ProjectReconcileResultEntity })
export class ProjectReconcileController {
  constructor(readonly projectReconcileService: ProjectReconcileService) {}

  @Post()
  async reconcile(@Param("projectId") projectId: string) {
    return this.projectReconcileService.reconcile(projectId);
  }
}
