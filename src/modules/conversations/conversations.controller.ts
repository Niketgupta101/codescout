import { Controller, Get, Post, Delete, Patch, Param, Body, Query, HttpCode, HttpStatus } from "@nestjs/common";
import { ConversationsService } from "./conversations.service";
import { CreateConversationDto } from "./dtos/create-conversation.dto";
import { UpdateConversationDto } from "./dtos/update-conversation.dto";

@Controller("projects/:projectId/conversations")
export class ConversationsController {
  constructor(readonly conversationsService: ConversationsService) {}

  /**
   * Create new conversation (without first message)
   */
  @Post()
  async create(@Param("projectId") projectId: string, @Body() dto: CreateConversationDto) {
    return this.conversationsService.create(projectId, dto.title, dto.model, dto.provider);
  }

  /**
   * List all conversations for project
   */
  @Get()
  async list(@Param("projectId") projectId: string) {
    const conversations = await this.conversationsService.findByProject(projectId);
    return {
      items: conversations,
      total: conversations.length,
    };
  }

  /**
   * Get conversation with messages
   */
  @Get(":conversationId")
  async getOne(
    @Param("projectId") projectId: string,
    @Param("conversationId") conversationId: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.conversationsService.findOne(projectId, conversationId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  /**
   * Update conversation title
   */
  @Patch(":conversationId")
  async update(@Param("conversationId") conversationId: string, @Body() dto: UpdateConversationDto) {
    return this.conversationsService.updateTitle(conversationId, dto.title);
  }

  /**
   * Delete conversation
   */
  @Delete(":conversationId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param("projectId") projectId: string, @Param("conversationId") conversationId: string) {
    await this.conversationsService.delete(projectId, conversationId);
  }
}
