import { z } from "zod";

export const ProjectDocumentReadRangeSchema = z
  .object({
    projectId: z.uuid().optional().describe("Project UUID the document belongs to. Provide this OR gitRemoteUrl."),
    gitRemoteUrl: z
      .url()
      .optional()
      .describe("Git remote URL of an indexed repository. Used to auto-resolve projectId."),
    documentId: z.uuid().optional().describe("Indexed ProjectDocument UUID. Required unless statementId is provided."),
    statementId: z
      .uuid()
      .optional()
      .describe(
        "Optional extracted statement UUID. Returns the source lines surrounding it when the wording can be located.",
      ),
    startLine: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("First line to include (1-indexed). Required unless statementId is provided."),
    endLine: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Last line to include (1-indexed, inclusive). Range size is capped at 1500 lines per call."),
  })
  .refine((input) => input.documentId ?? input.statementId, {
    message: "documentId or statementId is required",
  })
  .refine((input) => input.statementId ?? (input.startLine && input.endLine), {
    message: "startLine and endLine are required unless statementId is provided",
  });

export type ProjectDocumentReadRangeInput = z.infer<typeof ProjectDocumentReadRangeSchema>;
