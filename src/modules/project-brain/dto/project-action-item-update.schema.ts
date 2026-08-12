import { z } from "zod";
import { ProjectDocumentActionItemStatus } from "@prisma/client";

export const ProjectActionItemUpdateSchema = z.object({
  projectId: z.uuid().optional().describe("Project UUID the action item belongs to. Provide this OR gitRemoteUrl."),
  gitRemoteUrl: z
    .url()
    .optional()
    .describe("Git remote URL of an indexed repository. Used to auto-resolve projectId."),
  actionItemId: z.uuid().describe("UUID of the canonical action item to update."),
  status: z.enum(ProjectDocumentActionItemStatus).describe("The status a human is setting (e.g. done)."),
});

export type ProjectActionItemUpdateInput = z.infer<typeof ProjectActionItemUpdateSchema>;
