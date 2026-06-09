import { z } from "zod";

// at least one of projectId / gitRemoteUrl must be provided - enforced in mcpActorService.projectFindOneForAccessCheck
export const ConversationListSchema = z.object({
  projectId: z
    .uuid()
    .optional()
    .describe("Project UUID whose conversations should be listed. Provide this OR gitRemoteUrl."),
  gitRemoteUrl: z.url().optional().describe("Git remote URL of an indexed repository. Used to auto-resolve projectId."),
});

export type ConversationListInput = z.infer<typeof ConversationListSchema>;
