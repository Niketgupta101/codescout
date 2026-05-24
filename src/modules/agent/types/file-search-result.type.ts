export type FileSearchResult = {
  projectId: string;
  projectName: string;
  path: string;
  documentType: string | null;
  summary: string;
  similarity: number;
};
