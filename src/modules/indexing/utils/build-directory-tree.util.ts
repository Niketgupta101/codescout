import { IndexingDirectoryTreeNode } from "../types/indexing-directory-tree-node.type";

// derives every distinct directory implied by a set of file paths
// output is sorted by depth ascending then path so parents precede children — useful when inserting Directory rows under FK constraints
export const buildDirectoryTreeFromCodeFilePaths = (codeFilePaths: string[]): IndexingDirectoryTreeNode[] => {
  const directoryFullPaths = new Set<string>();

  for (const codeFilePath of codeFilePaths) {
    let currentPath = codeFilePath;

    while (currentPath.includes("/")) {
      currentPath = currentPath.substring(0, currentPath.lastIndexOf("/"));

      // skip the empty string that can result from a leading slash; only collect real directory paths
      if (currentPath.length > 0) {
        directoryFullPaths.add(currentPath);
      }
    }
  }

  const nodes: IndexingDirectoryTreeNode[] = [...directoryFullPaths].map((fullPath) => {
    const lastSlashIndex = fullPath.lastIndexOf("/");

    // top-level directories have no slash so they have no parent in our hierarchy
    // everyone else resolves to the path before the last slash
    const parentFullPath = lastSlashIndex === -1 ? null : fullPath.substring(0, lastSlashIndex);

    const depth = fullPath.split("/").length;

    return { fullPath, parentFullPath, depth };
  });

  nodes.sort((a, b) => a.depth - b.depth || a.fullPath.localeCompare(b.fullPath));

  return nodes;
};

// returns the directory the file lives in, or null when the file sits at the project root with no containing directory
export const findContainingDirectoryFullPath = (codeFilePath: string): string | null => {
  const lastSlashIndex = codeFilePath.lastIndexOf("/");

  // file at root has no slash and therefore no Directory row to point at
  return lastSlashIndex === -1 ? null : codeFilePath.substring(0, lastSlashIndex);
};
