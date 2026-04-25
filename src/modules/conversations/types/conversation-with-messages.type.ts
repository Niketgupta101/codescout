import type { Conversation, Message } from "@prisma/client";

export type ConversationWithMessages = Conversation & {
  messages: Message[];
  messageCount: number;
};

export type ConversationSummary = Conversation & {
  messageCount: number;
  lastMessageAt: Date | null;
};
