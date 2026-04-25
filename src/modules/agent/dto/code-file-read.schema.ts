import { z } from "zod";

export const CodeFileReadSchema = z.object({
  projectId: z
    .uuid()
    .optional()
    .describe("Project UUID the file belongs to. Provide this OR gitRemoteUrl."),
  gitRemoteUrl: z
    .url()
    .optional()
    .describe("Git remote URL of an indexed repository. Used to auto-resolve projectId."),
  filePath: z
    .string()
    .min(1)
    .describe('Full path of the file to read, exactly as returned by codeFileSearch (e.g. "src/auth/auth.service.ts").'),
});

export type CodeFileReadInput = z.infer<typeof CodeFileReadSchema>;
