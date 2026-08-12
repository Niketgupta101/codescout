export type ProjectFolderImportIssue = {
  // path relative to the folder root
  path: string;
  status: "skipped" | "failed";
  reason: string;
};
