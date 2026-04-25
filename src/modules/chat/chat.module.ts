import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AgentModule } from "../agent/agent.module";
import { OpenAIModule } from "../openai/openai.module";
import { ChatService } from "./chat.service";
import { ChatController } from "./chat.controller";

@Module({
  imports: [ConfigModule, AgentModule, OpenAIModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
