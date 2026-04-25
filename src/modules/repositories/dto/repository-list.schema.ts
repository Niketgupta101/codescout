import { z } from "zod";

export const RepositoryListSchema = z.object({
  projectId: z
    .uuid()
    .optional()
    .describe("Project UUID whose repositories should be listed. Provide this OR gitRemoteUrl."),
  gitRemoteUrl: z
    .url()
    .optional()
    .describe("Git remote URL of an indexed repository. Used to auto-resolve projectId."),
});

export type RepositoryListInput = z.infer<typeof RepositoryListSchema>;
