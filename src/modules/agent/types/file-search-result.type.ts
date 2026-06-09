export type FileSearchResult = {
  projectId: string;
  projectName: string;
  // populated only in cross-project mode - single-project chats already have project summary in the system prompt
  projectSummary?: string;
  path: string;
  // summary of the containing directory, when the file is in one and the directory has been summarized
  directorySummary?: string;
  documentType: string | null;
  summary: string;
  similarity: number;
};
