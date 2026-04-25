import { z } from "zod";

// repositoryId alone is sufficient — the repo's projectId is read from the row, then access is checked
export const RepositoryStatusGetSchema = z.object({
  repositoryId: z.uuid().describe("Repository UUID to fetch status and metadata for."),
});

export type RepositoryStatusGetInput = z.infer<typeof RepositoryStatusGetSchema>;
