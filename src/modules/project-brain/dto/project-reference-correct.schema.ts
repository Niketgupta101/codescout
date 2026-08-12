import { z } from "zod";
import { ProjectDocumentReferenceResolution } from "@prisma/client";

export const ProjectReferenceCorrectSchema = z.object({
  projectId: z.uuid().optional().describe("Project UUID the reference belongs to. Provide this OR gitRemoteUrl."),
  gitRemoteUrl: z
    .url()
    .optional()
    .describe("Git remote URL of an indexed repository. Used to auto-resolve projectId."),
  referenceId: z.uuid().describe("UUID of the reference to correct."),
  operation: z
    .enum(["edit", "invalidate"])
    .describe("edit: set resolution/target; invalidate: hide this reference as wrong."),
  patch: z
    .object({
      resolution: z.enum(ProjectDocumentReferenceResolution).optional(),
      resolvedToDocumentId: z.uuid().nullable().optional(),
      resolvedToStatementId: z.uuid().nullable().optional(),
    })
    .optional()
    .describe("Corrected resolution/target for an edit (ignored for invalidate)."),
  note: z.string().optional().describe("Optional note explaining the correction."),
});

export type ProjectReferenceCorrectInput = z.infer<typeof ProjectReferenceCorrectSchema>;
