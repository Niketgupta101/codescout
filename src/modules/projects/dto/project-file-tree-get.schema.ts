import { z } from "zod";

export const ProjectFileTreeGetSchema = z.object({
  projectId: z
    .uuid()
    .optional()
    .describe("Project UUID to get the file tree for. Provide this OR gitRemoteUrl."),
  gitRemoteUrl: z
    .url()
    .optional()
    .describe("Git remote URL of an indexed repository. Used to auto-resolve projectId."),
});

export type ProjectFileTreeGetInput = z.infer<typeof ProjectFileTreeGetSchema>;
