import { z } from "zod";

// no projectId - cost estimation is project-agnostic; it clones the repo and tokenizes locally
export const RepositoryIndexCostEstimateSchema = z.object({
  url: z.url().describe("GitHub repository URL to estimate indexing cost for."),
  branch: z.string().optional().describe("Branch to estimate against. Defaults to the repository's default branch."),
  includeTests: z
    .boolean()
    .optional()
    .describe("Whether tests would be included in real indexing. Defaults to false. Affects file count and cost."),
  authToken: z.string().optional().describe("Personal access token for cloning private repositories."),
});

export type RepositoryIndexCostEstimateInput = z.infer<typeof RepositoryIndexCostEstimateSchema>;
