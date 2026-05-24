export type SymbolInfo = {
  projectId: string;
  projectName: string;
  name: string;
  type: string;
  filePath: string;
  // 1-indexed inclusive line range from the parser; absent for non-code kinds (CSV epic/storyId rows)
  // when present, prefer read_file_range(filePath, startLine, endLine) over read_file to fetch just this symbol's body
  startLine?: number;
  endLine?: number;
};
