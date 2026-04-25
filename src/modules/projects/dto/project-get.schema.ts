import { z } from "zod";

export const ProjectGetSchema = z.object({
  projectId: z.uuid().optional().describe("Project UUID to fetch. Provide this OR gitRemoteUrl."),
  gitRemoteUrl: z
    .url()
    .optional()
    .describe("Git remote URL of an indexed repository. Used to auto-resolve projectId."),
});

export type ProjectGetInput = z.infer<typeof ProjectGetSchema>;
