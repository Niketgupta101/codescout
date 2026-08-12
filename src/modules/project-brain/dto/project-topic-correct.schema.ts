import { z } from "zod";
import { ProjectTopicType } from "@prisma/client";

export const ProjectTopicCorrectSchema = z.object({
  projectId: z.uuid().optional().describe("Project UUID the topic belongs to. Provide this OR gitRemoteUrl."),
  gitRemoteUrl: z
    .url()
    .optional()
    .describe("Git remote URL of an indexed repository. Used to auto-resolve projectId."),
  topicId: z.uuid().describe("UUID of the canonical topic to correct."),
  name: z.string().optional().describe("New name for the topic."),
  type: z.enum(ProjectTopicType).optional().describe("New type for the topic."),
});

export type ProjectTopicCorrectInput = z.infer<typeof ProjectTopicCorrectSchema>;
