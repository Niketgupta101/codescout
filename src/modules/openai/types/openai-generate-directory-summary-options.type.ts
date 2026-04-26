import { OpenAiFileOrDirectoryPathSummary } from "./openai-file-or-directory-path-summary.type";

export type OpenAiGenerateDirectorySummaryOptions = {
  projectName: string;
  directoryFullPath: string;
  fileSummaries: OpenAiFileOrDirectoryPathSummary[];
  childDirectorySummaries: OpenAiFileOrDirectoryPathSummary[];
  model?: string;
};
