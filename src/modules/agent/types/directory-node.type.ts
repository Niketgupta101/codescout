export type DirectoryNode = {
  path: string;
  type: "file" | "folder";
  language?: string;
  children?: DirectoryNode[];
};
