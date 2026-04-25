import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { OpenAIService } from "../openai/openai.service";
import type { Conversation, Message } from "@prisma/client";
import type { ConversationWithMessages, ConversationSummary } from "./types/conversation-with-messages.type";
import type { LLMMessage } from "../llm/types/llm-message.type";
import type { StoredToolCall } from "./types/stored-tool-call.type";

@Injectable()
export class ConversationsService {
  readonly logger = new Logger(ConversationsService.name);

  constructor(
    readonly prisma: PrismaService,
    readonly openaiService: OpenAIService,
  ) {}

  async create(projectId: string, title?: string, model?: string, provider?: string): Promise<Conversation> {
    return this.prisma.conversation.create({
      data: {
        projectId,
        title: title ?? "New conversation",
        model: model ?? "gpt-4o-mini",
        provider: provider ?? "openai",
      },
    });
  }

  async findOne(
    projectId: string,
    conversationId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<ConversationWithMessages> {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        projectId,
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: options?.limit,
          skip: options?.offset,
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found in project ${projectId}`);
    }

    const messageCount = await this.prisma.message.count({
      where: { conversationId },
    });

    return {
      ...conversation,
      messageCount,
    };
  }

  async findByProject(projectId: string): Promise<ConversationSummary[]> {
    const conversations = await this.prisma.conversation.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    return Promise.all(
      conversations.map(async (conv) => {
        const messageCount = await this.prisma.message.count({
          where: { conversationId: conv.id },
        });

        return {
          id: conv.id,
          projectId: conv.projectId,
          title: conv.title,
          model: conv.model,
          provider: conv.provider,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          messageCount,
          lastMessageAt: conv.messages[0]?.createdAt ?? null,
        };
      }),
    );
  }

  async updateTitle(conversationId: string, title: string): Promise<Conversation> {
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        title,
        updatedAt: new Date(),
      },
    });
  }

  async delete(projectId: string, conversationId: string): Promise<void> {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        projectId,
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found in project ${projectId}`);
    }

    await this.prisma.conversation.delete({
      where: { id: conversationId },
    });
  }

  async getConversationModel(conversationId: string): Promise<{
    model: string;
    provider: string;
  }> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { model: true, provider: true },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    return conversation;
  }

  async addMessage(
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    toolCalls?: unknown[],
    metadata?: unknown,
  ): Promise<Message> {
    // update conversation updatedAt
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return this.prisma.message.create({
      data: {
        conversationId,
        assitant: role === "assistant",
        content,
        toolCalls: toolCalls as never,
        metadata: metadata as never,
      },
    });
  }

  async updateMessageEmbedding(messageId: string, embedding: number[]): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "Message"
      SET "contentEmbedding" = ${`[${embedding.join(",")}]`}::vector
      WHERE id = ${messageId}::uuid
    `;
  }

  async buildContext(conversationId: string, includeLastNMessages = 10): Promise<LLMMessage[]> {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: includeLastNMessages,
    });

    messages.reverse(); // chronological order

    const context: LLMMessage[] = [];
    const totalMessages = messages.length;

    for (let i = 0; i < totalMessages; i++) {
      const msg = messages[i];
      const isRecent = i >= totalMessages - 6; // last 3 turns (6 messages)

      if (!msg.assitant) {
        context.push({
          role: "user",
          content: msg.content,
        });
      } else if (msg.assitant) {
        if (isRecent && msg.toolCalls) {
          // recent: full format with tool calls
          const toolCalls = (Array.isArray(msg.toolCalls) ? msg.toolCalls : []) as StoredToolCall[];

          if (toolCalls.length > 0) {
            // add assistant message with tool calls
            context.push({
              role: "assistant",
              content: msg.content || "",
              toolCalls: toolCalls.map((tc) => ({
                id: tc.id || `call_${Date.now()}`,
                name: tc.tool,
                arguments: tc.args,
              })),
            });

            // add tool result messages
            for (const tc of toolCalls) {
              context.push({
                role: "tool",
                toolResult: {
                  toolCallId: tc.id || `call_${Date.now()}`,
                  content: JSON.stringify(tc.result),
                },
              });
            }
          } else {
            // no tool calls, just add regular assistant message
            context.push({
              role: "assistant",
              content: msg.content || "",
            });
          }
        } else {
          // older: just the answer (strip tool calls to save tokens)
          context.push({
            role: "assistant",
            content: msg.content || "",
          });
        }
      }
    }

    return context;
  }

  async searchHistory(conversationId: string, query: string, topK = 3): Promise<Message[]> {
    try {
      // generate query embedding
      const queryEmbedding = await this.openaiService.generateEmbedding({ input: query });
      const embeddingStr = `[${queryEmbedding.join(",")}]`;

      // vector search on message embeddings
      const results = await this.prisma.$queryRawUnsafe<Message[]>(
        `
        SELECT id, "conversationId", assitant, content, "toolCalls", metadata, "createdAt"
        FROM "Message"
        WHERE "conversationId" = $1
          AND "contentEmbedding" IS NOT NULL
        ORDER BY "contentEmbedding" <=> $2::vector
        LIMIT $3
        `,
        conversationId,
        embeddingStr,
        topK,
      );

      this.logger.log(`Found ${results.length} messages in history search for query: "${query}"`);

      return results;
    } catch (error) {
      this.logger.error("Failed to search conversation history", error);
      return [];
    }
  }
}
