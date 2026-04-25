export type CodeFile = {
  path: string; // relative path from repo root
  absolutePath: string; // full filesystem path
  content: string;
  language: "typescript" | "javascript" | "json" | "yaml" | "prisma" | "pdf" | "markdown" | "plaintext";
};
