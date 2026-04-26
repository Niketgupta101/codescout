import { OpenAiFileOrDirectoryPathSummary } from "./openai-file-or-directory-path-summary.type";

export type OpenAiGenerateProjectSummaryOptions = {
  projectName: string;
  topLevelDirectorySummaries: OpenAiFileOrDirectoryPathSummary[];
  model?: string;
};
