import { z } from "zod";

export const ProjectFolderImportSchema = z.object({
  projectId: z
    .uuid()
    .describe("Project UUID owning the folder to import."),
  projectFolderId: z
    .uuid()
    .describe("Folder link UUID created via projectFolderCreate. Identifies which folder to import."),
  force: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Re-import every file, bypassing the unchanged-since-last-import skip. " +
        "Set to true when a folder's contents have been substantially edited since the last import.",
    ),
});

export type ProjectFolderImportInput = z.infer<typeof ProjectFolderImportSchema>;