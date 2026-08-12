import { z } from "zod";

export const ProjectTopicListSchema = z.object({
  projectId: z.uuid().optional().describe("Project UUID to list topics for. Provide this OR gitRemoteUrl."),
  gitRemoteUrl: z
    .url()
    .optional()
    .describe("Git remote URL of an indexed repository. Used to auto-resolve projectId."),
});

export type ProjectTopicListInput = z.infer<typeof ProjectTopicListSchema>;
