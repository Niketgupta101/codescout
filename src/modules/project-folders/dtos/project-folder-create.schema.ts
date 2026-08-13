import { z } from "zod";

export const ProjectFolderCreateSchema = z.object({
  projectId: z
    .uuid()
    .describe("Project UUID to add the folder to."),
  name: z.string().min(1).describe("Human-readable name for this folder link."),
  providerId: z
    .string()
    .min(1)
    .describe("Google Drive folder ID (the 'id' portion of the sharing URL)."),
});

export type ProjectFolderCreateInput = z.infer<typeof ProjectFolderCreateSchema>;