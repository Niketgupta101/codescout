import { Controller, Post, Param, Body } from "@nestjs/common";
import { ChatService } from "./chat.service";
import { SendMessageDto } from "./dtos/send-message.dto";

@Controller("projects/:projectId")
export class ChatController {
  constructor(readonly chatService: ChatService) {}

  /**
   * Unified message endpoint
   * - If conversationId provided: continue existing conversation
   * - If no conversationId: create new conversation with model/provider
   */
  @Post("messages")
  async sendMessage(@Param("projectId") projectId: string, @Body() dto: SendMessageDto) {
    return this.chatService.sendMessage(projectId, dto);
  }
}
