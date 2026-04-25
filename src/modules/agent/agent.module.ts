import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../prisma/prisma.module";
import { OpenAIModule } from "../openai/openai.module";
import { LLMModule } from "../llm/llm.module";
import { AgentToolsService } from "./agent-tools.service";
import { AgentService } from "./agent.service";

@Module({
  imports: [ConfigModule, PrismaModule, OpenAIModule, LLMModule],
  providers: [AgentToolsService, AgentService],
  exports: [AgentService],
})
export class AgentModule {}
