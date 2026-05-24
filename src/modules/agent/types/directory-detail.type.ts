export type DirectoryDetail = {
  path: string;
  // summary of this directory itself; absent when the directory hasn't been summarized (e.g. project root, empty dirs)
  summary?: string;
  files: {
    path: string;
    language: string;
    lines: number;
  }[];
  childDirectories: {
    path: string;
    // populated when the child directory has a summary; absent otherwise
    summary?: string;
  }[];
};
