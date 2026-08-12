import { Module } from "@nestjs/common";
import { McpModule as RekogMcpModule } from "@rekog/mcp-nest";
import { ProjectBrainService } from "./project-brain.service";
import { ProjectBrainMcp } from "./project-brain.mcp";
import { PrismaModule } from "../../prisma/prisma.module";
import { OpenAIModule } from "../openai/openai.module";
import { ProjectCorrectionModule } from "../project-correction/project-correction.module";

@Module({
  imports: [PrismaModule, OpenAIModule, ProjectCorrectionModule, RekogMcpModule.forFeature([ProjectBrainMcp], "codescout")],
  providers: [ProjectBrainService, ProjectBrainMcp],
  exports: [ProjectBrainService],
})
export class ProjectBrainModule {}
