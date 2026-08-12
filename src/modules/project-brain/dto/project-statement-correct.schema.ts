import { z } from "zod";
import {
  ProjectDocumentDecisionStatus,
  ProjectDocumentImplementationStatus,
  ProjectDocumentStatementType,
} from "@prisma/client";

export const ProjectStatementCorrectSchema = z.object({
  projectId: z.uuid().optional().describe("Project UUID the statement belongs to. Provide this OR gitRemoteUrl."),
  gitRemoteUrl: z
    .url()
    .optional()
    .describe("Git remote URL of an indexed repository. Used to auto-resolve projectId."),
  statementId: z.uuid().describe("UUID of the statement to correct."),
  operation: z
    .enum(["edit", "invalidate"])
    .describe("edit: patch fields; invalidate: hide this extraction as wrong."),
  patch: z
    .object({
      textDerived: z.string().optional(),
      reason: z.string().optional(),
      type: z.enum(ProjectDocumentStatementType).optional(),
      decisionStatus: z.enum(ProjectDocumentDecisionStatus).optional(),
      implementationStatus: z.enum(ProjectDocumentImplementationStatus).optional(),
    })
    .optional()
    .describe("Corrected fields for an edit (ignored for invalidate)."),
  note: z.string().optional().describe("Optional note explaining the correction."),
});

export type ProjectStatementCorrectInput = z.infer<typeof ProjectStatementCorrectSchema>;
