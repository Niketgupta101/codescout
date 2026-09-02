import type { ProjectFolderImportIssue } from "./project-folder-import-issue.type";

// outcome of importing one folder: only files that could not be ingested are reported
export type ProjectFolderImportResult = {
  projectFolderId: string;
  documentsChanged: number;
  issues: ProjectFolderImportIssue[];
};
