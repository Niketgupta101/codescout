import { z } from "zod";
import {
  ProjectDocumentDecisionStatus,
  ProjectDocumentImplementationStatus,
  ProjectDocumentStatementType,
} from "@prisma/client";

export const ProjectStatementSearchSchema = z.object({
  projectId: z.uuid().optional().describe("Project UUID to search statements in. Provide this OR gitRemoteUrl."),
  gitRemoteUrl: z
    .url()
    .optional()
    .describe("Git remote URL of an indexed repository. Used to auto-resolve projectId."),
  query: z.string().describe("Natural-language query; statements are ranked by semantic similarity to it."),
  type: z
    .enum(ProjectDocumentStatementType)
    .optional()
    .describe("Optional filter by statement kind (fact, proposal, decision, question)."),
  decisionStatus: z
    .enum(ProjectDocumentDecisionStatus)
    .optional()
    .describe("Optional filter by decision status (open, accepted, rejected, deferred, superseded)."),
  implementationStatus: z
    .enum(ProjectDocumentImplementationStatus)
    .optional()
    .describe("Optional filter by implementation status (notStarted, inProgress, blocked, done, reverted)."),
  includeSuperseded: z
    .boolean()
    .optional()
    .describe(
      "By default only current decisions are returned (statements overturned by a later decision, or ones the team " +
        "considered and rejected, are hidden). Set true to also include superseded and rejected statements, e.g. to " +
        "trace how a decision changed over time or what was ruled out.",
    ),
  limit: z.number().int().positive().optional().describe("Maximum number of statements to return (default 10)."),
});

export type ProjectStatementSearchInput = z.infer<typeof ProjectStatementSearchSchema>;
