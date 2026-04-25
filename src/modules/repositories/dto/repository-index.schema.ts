import { RepositoryType } from "@prisma/client";
import { z } from "zod";

export const RepositoryIndexSchema = z.object({
  projectId: z
    .uuid()
    .optional()
    .describe("Project UUID to index the repository into. Provide this OR gitRemoteUrl."),
  gitRemoteUrl: z
    .url()
    .optional()
    .describe(
      "Git remote URL of an existing indexed repository in the project. " +
        "Used to auto-resolve projectId; do not confuse with the URL being indexed.",
    ),
  url: z.url().describe("GitHub repository URL to clone and index."),
  branch: z.string().optional().describe("Branch to index. Defaults to the repository's default branch."),
  repositoryType: z
    .enum(Object.values(RepositoryType) as [RepositoryType, ...RepositoryType[]])
    .optional()
    .describe(
      "Classification of the repository. Defaults to 'custom'. " +
        "Used by codeFileSearch to filter results when documentTypes is provided.",
    ),
  includeTests: z
    .boolean()
    .optional()
    .describe("Whether to include test files (e.g. *.spec.ts, *.test.ts) in indexing. Defaults to false."),
  authToken: z
    .string()
    .optional()
    .describe("Personal access token for cloning private repositories."),
});

export type RepositoryIndexInput = z.infer<typeof RepositoryIndexSchema>;
