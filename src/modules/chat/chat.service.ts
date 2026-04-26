import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { AgentService } from "../agent/agent.service";
import { ConversationsService } from "../conversations/conversations.service";
import { OpenAIService } from "../openai/openai.service";
import type { LLMProvider } from "../llm/types/llm-provider.type";
import type { ChatRequest } from "./types/chat-request.type";
import type { ChatResponse } from "./types/chat-response.type";

/**
 * Chat service using agentic RAG
 * Delegates to agent service for query execution
 */
@Injectable()
export class ChatService {
  readonly logger = new Logger(ChatService.name);

  constructor(
    readonly agentService: AgentService,
    readonly openaiService: OpenAIService,
    @Inject(forwardRef(() => ConversationsService))
    readonly conversationsService: ConversationsService,
  ) {}

  /**
   * Handle chat query using agent (no conversation context)
   */
  async query(projectId: string, request: ChatRequest): Promise<ChatResponse> {
    this.logger.log(`Chat query for project ${projectId}: "${request.query}"`);

    const response = await this.agentService.query(projectId, request);

    this.logger.log(`Chat response: ${response.iterations} iterations, ${response.toolCalls.length} tool calls`);

    return response;
  }

  /**
   * Unified message handling
   * - If conversationId provided: continue existing conversation
   * - If no conversationId: create new conversation with model/provider
   */
  async sendMessage(
    projectId: string,
    request: ChatRequest & {
      conversationId?: string;
      model?: string;
      provider?: string;
      conversationTitle?: string;
    },
  ): Promise<{ conversationId: string; message: ChatResponse }> {
    let conversationId = request.conversationId;

    // create new conversation if conversationId not provided
    if (!conversationId) {
      if (!request.model || !request.provider) {
        throw new Error("model and provider are required when starting a new conversation");
      }

      const conversation = await this.conversationsService.create(
        projectId,
        request.conversationTitle ?? "New conversation",
        request.model,
        request.provider,
      );
      conversationId = conversation.id;
    }

    // send message using conversation's model
    const message = await this.queryInConversation(projectId, conversationId, request);

    return {
      conversationId,
      message,
    };
  }

  /**
   * Handle chat query in conversation thread
   */
  async queryInConversation(projectId: string, conversationId: string, request: ChatRequest): Promise<ChatResponse> {
    // 1. Get conversation's model and provider
    const { model, provider } = await this.conversationsService.getConversationModel(conversationId);

    this.logger.log(`Chat query in conversation ${conversationId}: "${request.query}" (${provider}/${model})`);

    // 2. Load conversation context
    const context = await this.conversationsService.buildContext(conversationId, request.includeLastNMessages ?? 10);

    // 3. Store user message
    const userMessage = await this.conversationsService.addMessage(conversationId, "user", request.query);

    this.logger.log(`Stored user message: ${userMessage.id}`);

    // 4. Execute agent query with context using conversation's model
    const response = await this.agentService.queryWithContext(
      projectId,
      request,
      context,
      conversationId,
      provider as LLMProvider,
      model,
    );

    // 4. Generate embedding for assistant message
    const { embedding } = await this.openaiService.generateEmbedding({ input: response.answer });

    // 5. Store assistant response
    const assistantMessage = await this.conversationsService.addMessage(
      conversationId,
      "assistant",
      response.answer,
      response.toolCalls,
      {
        iterations: response.iterations,
        durationMs: response.durationMs,
      },
    );

    // 6. Update message embedding
    await this.conversationsService.updateMessageEmbedding(assistantMessage.id, embedding);

    this.logger.log(`Chat response: ${response.iterations} iterations, ${response.toolCalls.length} tool calls`);

    return {
      ...response,
      messageId: assistantMessage.id,
    };
  }
}
