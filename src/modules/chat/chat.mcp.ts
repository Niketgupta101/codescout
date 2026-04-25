import { Injectable, Logger } from "@nestjs/common";
import { Tool, type Context } from "@rekog/mcp-nest";
import { McpActorService } from "src/modules/mcp/mcp-actor.service";
import { McpToolRequest } from "src/modules/mcp/types/mcp-tool-request.type";
import { ChatService } from "./chat.service";
import { ChatMessageCreateInput, ChatMessageCreateSchema } from "./dto/chat-message-create.schema";

@Injectable()
export class ChatMcp {
  readonly logger = new Logger(ChatMcp.name);

  constructor(
    readonly chatService: ChatService,
    readonly mcpActorService: McpActorService,
  ) {}

  /**
   * Sends a question to a project's agent and returns a structured answer.
   * Creates a new conversation when conversationId is omitted.
   * @param chatMessageCreateInput - Project, query, and optional conversation context
   * @param _context - MCP execution context (unused for this tool)
   * @param request - Raw HTTP request from the MCP transport
   * @returns Conversation ID and the structured answer
   */
  @Tool({
    name: "chatMessageCreate",
    description:
      "Ask a natural-language question about a project's codebase or documentation. " +
      "Returns a structured answer with code citations. " +
      "Use this for any question requiring synthesis across files (architecture, " +
      "'how does X work', 'where is Y used'). " +
      "Do NOT use for simple file reads — use codeFileRead instead. " +
      "When conversationId is omitted, a new conversation is started with the given model and provider.",
    parameters: ChatMessageCreateSchema,
  })
  async chatMessageCreate(chatMessageCreateInput: ChatMessageCreateInput, _context: Context, request?: McpToolRequest) {
    const actor = await this.mcpActorService.actorResolve(request);

    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: chatMessageCreateInput.projectId,
      gitRemoteUrl: chatMessageCreateInput.gitRemoteUrl,
      actor,
    });

    this.logger.log(
      `MCP chatMessageCreate: project=${project.id} hasConversationId=${Boolean(chatMessageCreateInput.conversationId)}`,
    );

    return this.chatService.sendMessage(project.id, {
      query: chatMessageCreateInput.query,
      conversationId: chatMessageCreateInput.conversationId,
      model: chatMessageCreateInput.model,
      provider: chatMessageCreateInput.provider,
      conversationTitle: chatMessageCreateInput.conversationTitle,
    });
  }
}
