import { z } from "zod";

// zod schema is required by @rekog/mcp-nest @Tool() — class-validator DTOs are not accepted
// describe() text is exposed to the consuming LLM as JSON Schema field descriptions
export const ChatMessageCreateSchema = z.object({
  projectId: z
    .uuid()
    .optional()
    .describe("Project UUID to ask the question against. Provide this OR gitRemoteUrl."),
  gitRemoteUrl: z
    .url()
    .optional()
    .describe("Git remote URL of an indexed repository. Used to auto-resolve projectId."),
  query: z.string().min(1).describe("Natural-language question about the codebase or documentation."),
  conversationId: z
    .uuid()
    .optional()
    .describe("Existing conversation ID to continue. Omit to start a new conversation."),
  model: z
    .string()
    .optional()
    .describe(
      'LLM model to use for new conversations (e.g. "gpt-4o-mini", "claude-3-5-sonnet-20241022"). ' +
        "Required when conversationId is omitted.",
    ),
  provider: z
    .enum(["openai", "anthropic"])
    .optional()
    .describe("LLM provider for new conversations. Required when conversationId is omitted."),
  conversationTitle: z
    .string()
    .optional()
    .describe("Optional title for the new conversation. Ignored when conversationId is provided."),
});

export type ChatMessageCreateInput = z.infer<typeof ChatMessageCreateSchema>;
