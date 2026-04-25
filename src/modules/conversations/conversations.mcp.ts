import { Injectable, Logger } from "@nestjs/common";
import { Tool, type Context } from "@rekog/mcp-nest";
import { McpActorService } from "src/modules/mcp/mcp-actor.service";
import { McpToolRequest } from "src/modules/mcp/types/mcp-tool-request.type";
import { ConversationsService } from "./conversations.service";
import { ConversationGetInput, ConversationGetSchema } from "./dto/conversation-get.schema";
import { ConversationListInput, ConversationListSchema } from "./dto/conversation-list.schema";

@Injectable()
export class ConversationsMcp {
  readonly logger = new Logger(ConversationsMcp.name);

  constructor(
    readonly conversationsService: ConversationsService,
    readonly mcpActorService: McpActorService,
  ) {}

  @Tool({
    name: "conversationList",
    description:
      "List all conversations in a project, ordered by most recently updated. " +
      "Use this to find an existing thread before continuing it via chatMessageCreate.",
    parameters: ConversationListSchema,
  })
  async conversationList(conversationListInput: ConversationListInput, _context: Context, request?: McpToolRequest) {
    const actor = await this.mcpActorService.actorResolve(request);
    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: conversationListInput.projectId,
      gitRemoteUrl: conversationListInput.gitRemoteUrl,
      actor,
    });

    return this.conversationsService.findByProject(project.id);
  }

  @Tool({
    name: "conversationGet",
    description:
      "Get a single conversation including its messages. " +
      "Use this to inspect history before continuing a thread, or to review an answer the agent gave earlier.",
    parameters: ConversationGetSchema,
  })
  async conversationGet(conversationGetInput: ConversationGetInput, _context: Context, request?: McpToolRequest) {
    const actor = await this.mcpActorService.actorResolve(request);
    const project = await this.mcpActorService.projectFindOneForAccessCheck({
      projectId: conversationGetInput.projectId,
      gitRemoteUrl: conversationGetInput.gitRemoteUrl,
      actor,
    });

    return this.conversationsService.findOne(project.id, conversationGetInput.conversationId, {
      limit: conversationGetInput.limit,
      offset: conversationGetInput.offset,
    });
  }
}
