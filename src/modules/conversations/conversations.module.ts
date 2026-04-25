import { Module, forwardRef } from "@nestjs/common";
import { ConversationsService } from "./conversations.service";
import { ConversationsController } from "./conversations.controller";
import { PrismaModule } from "../../prisma/prisma.module";
import { OpenAIModule } from "../openai/openai.module";
import { ChatModule } from "../chat/chat.module";
import { AgentModule } from "../agent/agent.module";

@Module({
  imports: [PrismaModule, OpenAIModule, forwardRef(() => ChatModule), forwardRef(() => AgentModule)],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
