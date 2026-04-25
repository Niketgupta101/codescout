import { z } from "zod";

// no inputs — listing returns all projects the actor can read
export const ProjectListSchema = z.object({});

export type ProjectListInput = z.infer<typeof ProjectListSchema>;
