import { z } from "zod";

export const CodeFileReadRangeSchema = z.object({
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
  startLine: z.number().int().positive().describe("First line to include (1-indexed)."),
  endLine: z.number().int().positive().describe("Last line to include (1-indexed, inclusive). Range size is capped at 1500 lines per call."),
});

export type CodeFileReadRangeInput = z.infer<typeof CodeFileReadRangeSchema>;
