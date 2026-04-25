import { z } from "zod";

export const ConversationGetSchema = z.object({
  projectId: z
    .uuid()
    .optional()
    .describe("Project UUID the conversation belongs to. Provide this OR gitRemoteUrl."),
  gitRemoteUrl: z
    .url()
    .optional()
    .describe("Git remote URL of an indexed repository. Used to auto-resolve projectId."),
  conversationId: z.uuid().describe("Conversation UUID to fetch."),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum number of messages to include. Omit to return all messages."),
  offset: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Number of messages to skip from the start. Useful for paging through long conversations."),
});

export type ConversationGetInput = z.infer<typeof ConversationGetSchema>;
