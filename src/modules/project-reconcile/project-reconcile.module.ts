import { Module } from "@nestjs/common";
import { ProjectReconcileService } from "./project-reconcile.service";
import { ProjectReconcileController } from "./project-reconcile.controller";
import { PrismaModule } from "../../prisma/prisma.module";
import { OpenAIModule } from "../openai/openai.module";
import { ProjectCorrectionModule } from "../project-correction/project-correction.module";

@Module({
  imports: [PrismaModule, OpenAIModule, ProjectCorrectionModule],
  controllers: [ProjectReconcileController],
  providers: [ProjectReconcileService],
  exports: [ProjectReconcileService],
})
export class ProjectReconcileModule {}
