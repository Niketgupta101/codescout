// a single file discovered while crawling a google drive folder (folders themselves are not emitted)
export type GoogleDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  // path relative to the crawl root, e.g. "project-knowledge/raw-threads/timocom/thread.md"
  path: string;
  parentId: string;
  modifiedAt: Date | null;
  sizeBytes: number | null;
};
