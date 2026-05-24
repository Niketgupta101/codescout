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
    // web UI historically relied on auto-create-conversation when no conversationId was sent;
    // default persist to true here so that behavior is preserved while MCP can opt out
    return this.chatService.sendMessage(projectId, { ...dto, persist: dto.persist ?? true });
  }
}
