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
      "Delegate a codebase question to a server-side agent that drives its own search → read → synthesize loop and returns a structured answer with code citations. " +
      "PREFER codeFileSearch + codeFileRead + symbolSearch for ad-hoc questions you can drive yourself — those are cheaper, faster, and more flexible. " +
      "Use chatMessageCreate when: (a) you specifically need the structured {answer, details, codeSnippets} shape, (b) you need server-side conversation persistence, or (c) you're forwarding a question from a non-agentic consumer. " +
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
