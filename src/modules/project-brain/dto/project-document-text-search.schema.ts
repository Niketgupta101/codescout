import { z } from "zod";

export const ProjectDocumentTextSearchSchema = z.object({
  projectId: z.uuid().optional().describe("Project UUID to search. Provide this OR gitRemoteUrl."),
  gitRemoteUrl: z.url().optional().describe("Git remote URL of an indexed repository. Used to auto-resolve projectId."),
  query: z
    .string()
    .min(1)
    .describe(
      "Exact word or phrase to find in imported raw source text. Use for names, IDs, and terms missing from extracted statements.",
    ),
});

export type ProjectDocumentTextSearchInput = z.infer<typeof ProjectDocumentTextSearchSchema>;
