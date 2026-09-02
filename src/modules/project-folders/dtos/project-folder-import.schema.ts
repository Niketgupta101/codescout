import { z } from "zod";

export const ProjectFolderImportSchema = z.object({
  projectId: z
    .uuid()
    .describe("Project UUID owning the folder to import."),
  projectFolderId: z
    .uuid()
    .describe("Folder link UUID created via projectFolderCreate. Identifies which folder to import."),
});

export type ProjectFolderImportInput = z.infer<typeof ProjectFolderImportSchema>;