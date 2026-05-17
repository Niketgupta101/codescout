export type SymbolInfo = {
  name: string;
  type: string;
  filePath: string;
  context?: string;
  // 1-indexed inclusive line range from the parser; absent for symbols indexed before this field existed (markdown headings, parent-class shortcut rows, pre-backfill data)
  // when present, prefer read_file_range(filePath, startLine, endLine) over read_file to fetch just this symbol's body
  startLine?: number;
  endLine?: number;
};
