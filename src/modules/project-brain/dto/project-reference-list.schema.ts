import { z } from "zod";
import { ProjectDocumentReferenceResolution } from "@prisma/client";

export const ProjectReferenceListSchema = z.object({
  projectId: z.uuid().optional().describe("Project UUID to list references for. Provide this OR gitRemoteUrl."),
  gitRemoteUrl: z
    .url()
    .optional()
    .describe("Git remote URL of an indexed repository. Used to auto-resolve projectId."),
  resolution: z
    .enum(ProjectDocumentReferenceResolution)
    .optional()
    .describe(
      "Optional filter by how the reference resolved (notFound, linked, contradicted). " +
        "Use notFound to surface dangling assumptions or contradicted to surface conflicts across documents.",
    ),
});

export type ProjectReferenceListInput = z.infer<typeof ProjectReferenceListSchema>;
