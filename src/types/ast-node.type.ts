import type { CodeMetadata } from "./code-metadata.type";

export type ASTNodeType = "function" | "method" | "class" | "interface" | "type" | "enum" | "variable";

export type ASTNode = {
  type: ASTNodeType;
  name: string;
  content: string;
  metadata: CodeMetadata;
  children?: ASTNode[];
};
