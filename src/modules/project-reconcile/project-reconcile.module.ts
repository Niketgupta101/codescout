import { Module } from "@nestjs/common";
import { ProjectReconcileService } from "./project-reconcile.service";
import { ProjectReconcileController } from "./project-reconcile.controller";
import { PrismaModule } from "../../prisma/prisma.module";
import { OpenAIModule } from "../openai/openai.module";

@Module({
  imports: [PrismaModule, OpenAIModule],
  controllers: [ProjectReconcileController],
  providers: [ProjectReconcileService],
  exports: [ProjectReconcileService],
})
export class ProjectReconcileModule {}
