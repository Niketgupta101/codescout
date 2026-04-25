import type { ParsedSection } from "./parsed-section.type";

export type ParsedDocument = {
  sourceFile: string;
  rawContent?: string;
  sections: ParsedSection[];
  [key: string]: unknown;
};
