import { z } from "zod";

export const ProjectDocumentReadSchema = z
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
        "Optional extracted statement UUID. Reads its source document and reports whether the source wording was located.",
      ),
  })
  .refine((input) => input.documentId ?? input.statementId, {
    message: "documentId or statementId is required",
  });

export type ProjectDocumentReadInput = z.infer<typeof ProjectDocumentReadSchema>;
