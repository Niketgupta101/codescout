import { Module } from "@nestjs/common";
import { McpModule as RekogMcpModule } from "@rekog/mcp-nest";
import { ConversationsService } from "./conversations.service";
import { ConversationsController } from "./conversations.controller";
import { ConversationsMcp } from "./conversations.mcp";
import { PrismaModule } from "../../prisma/prisma.module";
import { OpenAIModule } from "../openai/openai.module";

@Module({
  imports: [PrismaModule, OpenAIModule, RekogMcpModule.forFeature([ConversationsMcp], "codescout")],
  controllers: [ConversationsController],
  providers: [ConversationsService, ConversationsMcp],
  exports: [ConversationsService],
})
export class ConversationsModule {}
