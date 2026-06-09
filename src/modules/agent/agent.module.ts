import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { McpModule as RekogMcpModule } from "@rekog/mcp-nest";
import { PrismaModule } from "../../prisma/prisma.module";
import { ConversationsModule } from "../conversations/conversations.module";
import { OpenAIModule } from "../openai/openai.module";
import { LLMModule } from "../llm/llm.module";
import { AgentMcp } from "./agent.mcp";
import { AgentToolsService } from "./agent-tools.service";
import { AgentService } from "./agent.service";

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    OpenAIModule,
    LLMModule,
    forwardRef(() => ConversationsModule),
    RekogMcpModule.forFeature([AgentMcp], "codescout"),
  ],
  providers: [AgentToolsService, AgentService, AgentMcp],
  exports: [AgentService, AgentToolsService],
})
export class AgentModule {}
