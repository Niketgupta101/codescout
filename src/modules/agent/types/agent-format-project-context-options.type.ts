import { AgentProjectContextDirectorySummary } from "./agent-project-context-directory-summary.type";

export type AgentFormatProjectContextOptions = {
  projectName: string;
  projectSummary: string | null;
  directories: AgentProjectContextDirectorySummary[];
  maxDepth?: number;
  maxDirectoryEntries?: number;
};
