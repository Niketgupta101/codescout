import * as path from "path";
import type { ParsedDocument } from "../types/parsed-document.type";

export const parseJson = (filePath: string, content: string): ParsedDocument => {
  const fileName = path.basename(filePath);

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const chunkContent = JSON.stringify(parsed, null, 2);

    return {
      sourceFile: filePath,
      format: "json",
      sections: [
        {
          heading: fileName,
          depth: 1,
          chunks: [{ content: chunkContent }],
        },
      ],
    };
  } catch {
    // fallback: treat as plain text
    return {
      sourceFile: filePath,
      format: "json",
      sections: [
        {
          heading: fileName,
          depth: 1,
          chunks: [{ content }],
        },
      ],
    };
  }
};
