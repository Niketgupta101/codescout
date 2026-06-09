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
   * Stateless by default - pass persist=true (or provide conversationId) to keep server-side history.
   * @param chatMessageCreateInput - Project, query, and optional conversation context
   * @param _context - MCP execution context (unused for this tool)
   * @param request - Raw HTTP request from the MCP transport
   * @returns Conversation ID (null on stateless calls) and the structured answer
   */
  @Tool({
    name: "chatMessageCreate",
    description:
      "Delegate a codebase question to a server-side agent that drives its own search → read → synthesize loop. " +
      "Returns the research agent's raw findings (file paths, quoted code, reasoning) so the calling LLM can format them for the end user - no second formatting pass is run server-side. " +
      "PREFER codeFileSearch + codeFileRead + symbolSearch for ad-hoc questions you can drive yourself - those are cheaper and more flexible. " +
      "Use chatMessageCreate when: (a) you want the server to handle multi-step research in one call, or (b) you're forwarding a question from a non-agentic consumer. " +
      "Stateless by default: no Conversation/Message is created unless you pass persist=true or supply a conversationId. " +
      "When conversationId is provided, the existing conversation is continued (always persisted).",
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
      `MCP chatMessageCreate: project=${project.id} hasConversationId=${Boolean(chatMessageCreateInput.conversationId)} persist=${Boolean(chatMessageCreateInput.persist)}`,
    );

    return this.chatService.sendMessage(project.id, {
      query: chatMessageCreateInput.query,
      conversationId: chatMessageCreateInput.conversationId,
      model: chatMessageCreateInput.model,
      provider: chatMessageCreateInput.provider,
      conversationTitle: chatMessageCreateInput.conversationTitle,
      persist: chatMessageCreateInput.persist,
      // MCP callers are LLMs - running our analyst pass on top of theirs is duplicate work and double-charges tokens
      skipAnswerFormatting: true,
    });
  }
}
