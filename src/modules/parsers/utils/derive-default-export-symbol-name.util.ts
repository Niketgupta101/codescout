import * as path from "path";

// next.js role-bearing filenames: when a file is named one of these, its parent directory carries the meaningful name
// adding the role as a suffix preserves intent ("UsersPage" reads better than "Page" alone)
const NEXT_JS_ROLE_FILE_BASENAMES = [
  "page",
  "layout",
  "route",
  "loading",
  "error",
  "not-found",
  "template",
  "default",
];

const INDEX_FILE_BASENAMES = ["index"];

// produces a pascal-case symbol name for an anonymous default export
// the name is what shows up in search_symbols, so it should reflect the file's role rather than be a generic placeholder
export const deriveDefaultExportSymbolName = (filePath: string): string => {
  const fileBasenameWithoutExtension = path.basename(filePath, path.extname(filePath));
  const parentDirectoryName = path.basename(path.dirname(filePath));

  const fileBasenameLower = fileBasenameWithoutExtension.toLowerCase();

  // next.js role files: combine parent dir name + role, e.g. app/users/page.tsx -> "UsersPage"
  if (NEXT_JS_ROLE_FILE_BASENAMES.includes(fileBasenameLower)) {
    const cleanedParent = stripDynamicSegmentBrackets(parentDirectoryName);

    // empty or root parent (e.g. "page.tsx" at repo root) — fall back to just the role name
    if (!cleanedParent || cleanedParent === "." || cleanedParent === "") {
      return toPascalCase(fileBasenameWithoutExtension);
    }

    return `${toPascalCase(cleanedParent)}${toPascalCase(fileBasenameWithoutExtension)}`;
  }

  // index files: parent dir is the meaningful name, e.g. components/Button/index.tsx -> "Button"
  if (INDEX_FILE_BASENAMES.includes(fileBasenameLower)) {
    const cleanedParent = stripDynamicSegmentBrackets(parentDirectoryName);

    if (cleanedParent && cleanedParent !== "." && cleanedParent !== "") {
      return toPascalCase(cleanedParent);
    }

    return "Default";
  }

  // ordinary files: use the filename itself, e.g. MyComponent.tsx -> "MyComponent"
  return toPascalCase(fileBasenameWithoutExtension);
};

// next.js dynamic route segments ("[id]", "[...slug]") would produce ugly symbol names; strip the brackets and ellipsis
const stripDynamicSegmentBrackets = (segment: string): string => {
  return segment.replace(/[[\]]/g, "").replace(/^\.\.\./, "");
};

const toPascalCase = (input: string): string => {
  return input
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
};
