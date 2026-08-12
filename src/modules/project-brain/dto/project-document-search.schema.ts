import { z } from "zod";
import { ProjectDocumentType } from "@prisma/client";

export const ProjectDocumentSearchSchema = z.object({
  projectId: z.uuid().optional().describe("Project UUID to search. Provide this OR gitRemoteUrl."),
  gitRemoteUrl: z.url().optional().describe("Git remote URL of an indexed repository. Used to auto-resolve projectId."),
  query: z.string().min(1).describe("Natural-language description of the source documents to find."),
  type: z.enum(ProjectDocumentType).optional().describe("Optional document-type filter."),
  topK: z
    .number()
    .int()
    .positive()
    .max(20)
    .optional()
    .describe(
      "Maximum number of results to return. Defaults to 5; increase only when the first results are insufficient.",
    ),
});

export type ProjectDocumentSearchInput = z.infer<typeof ProjectDocumentSearchSchema>;
