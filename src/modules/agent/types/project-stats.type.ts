export type ProjectStats = {
  totalFiles: number;
  filesByLanguage: Record<string, number>;
  totalSymbols: number;
  symbolsByType: Record<string, number>;
};
