import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { McpModule as RekogMcpModule } from "@rekog/mcp-nest";
import { AgentModule } from "../agent/agent.module";
import { ConversationsModule } from "../conversations/conversations.module";
import { OpenAIModule } from "../openai/openai.module";
import { ChatMcp } from "./chat.mcp";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";

@Module({
  imports: [
    ConfigModule,
    AgentModule,
    OpenAIModule,
    forwardRef(() => ConversationsModule),
    RekogMcpModule.forFeature([ChatMcp], "code-chat"),
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatMcp],
  exports: [ChatService],
})
export class ChatModule {}
