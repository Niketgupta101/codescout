import { z } from "zod";

export const ProjectCreateSchema = z.object({
  name: z.string().min(1).describe("Unique project name."),
  description: z.string().optional().describe("Optional human-readable description of the project."),
});

export type ProjectCreateInput = z.infer<typeof ProjectCreateSchema>;
