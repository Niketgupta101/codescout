import type { ParsedChunk } from "./parsed-chunk.type";

export type ParsedSection = {
  heading: string;
  chunks: ParsedChunk[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};
