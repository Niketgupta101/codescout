import { z } from "zod";

export const ProjectStatsGetSchema = z.object({
  projectId: z
    .uuid()
    .optional()
    .describe("Project UUID to get statistics for. Provide this OR gitRemoteUrl."),
  gitRemoteUrl: z
    .url()
    .optional()
    .describe("Git remote URL of an indexed repository. Used to auto-resolve projectId."),
});

export type ProjectStatsGetInput = z.infer<typeof ProjectStatsGetSchema>;
