import { z } from "zod";
import { ProjectDocumentActionItemStatus } from "@prisma/client";

export const ProjectActionItemListSchema = z.object({
  projectId: z.uuid().optional().describe("Project UUID to list action items for. Provide this OR gitRemoteUrl."),
  gitRemoteUrl: z
    .url()
    .optional()
    .describe("Git remote URL of an indexed repository. Used to auto-resolve projectId."),
  status: z
    .enum(ProjectDocumentActionItemStatus)
    .optional()
    .describe("Optional filter to only return canonical action items in this status."),
  owner: z
    .string()
    .optional()
    .describe("Optional case-insensitive substring filter on the item owner (e.g. a person's name)."),
  topicId: z
    .uuid()
    .optional()
    .describe("Optional canonical topic UUID; returns only action items whose source discussion is under this topic."),
  stale: z
    .boolean()
    .optional()
    .describe("Optional filter; true returns only stale items (canonical items with no current supporting document)."),
});

export type ProjectActionItemListInput = z.infer<typeof ProjectActionItemListSchema>;
