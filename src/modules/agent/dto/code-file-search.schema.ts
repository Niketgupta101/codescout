import { z } from "zod";

export const CodeFileSearchSchema = z.object({
  projectId: z
    .uuid()
    .optional()
    .describe(
      "Project UUID to search within. Provide projectId OR gitRemoteUrl to scope to one project; omit BOTH for cross-project discovery across every project you can read.",
    ),
  gitRemoteUrl: z
    .url()
    .optional()
    .describe("Git remote URL of an indexed repository. Used to auto-resolve projectId."),
  query: z.string().min(1).describe("Natural-language description of the files you are looking for."),
  documentTypes: z
    .array(z.string())
    .optional()
    .describe(
      "Optional filter by repository or document type (e.g. backendCodebase, webCodebase, requirements). " +
        "Omit to search across all indexed content.",
    ),
  topK: z
    .number()
    .int()
    .positive()
    .max(50)
    .optional()
    .describe("Maximum number of results to return. Defaults to 3; raise to 5-8 only when the first batch is clearly insufficient."),
});

export type CodeFileSearchInput = z.infer<typeof CodeFileSearchSchema>;
