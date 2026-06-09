import { Module } from "@nestjs/common";
import { McpModule as RekogMcpModule } from "@rekog/mcp-nest";
import { ProjectService } from "./projects.service";
import { ProjectsController } from "./projects.controller";
import { ProjectsMcp } from "./projects.mcp";
import { PrismaModule } from "../../prisma/prisma.module";
import { AgentModule } from "../agent/agent.module";
import { ChatModule } from "../chat/chat.module";

@Module({
  imports: [PrismaModule, AgentModule, ChatModule, RekogMcpModule.forFeature([ProjectsMcp], "codescout")],
  controllers: [ProjectsController],
  providers: [ProjectService, ProjectsMcp],
  exports: [ProjectService],
})
export class ProjectsModule {}
