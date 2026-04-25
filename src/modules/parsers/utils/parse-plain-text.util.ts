import * as path from "path";
import type { ParsedDocument } from "../types/parsed-document.type";

export const parsePlainText = (filePath: string, content: string): ParsedDocument => {
  const fileName = path.basename(filePath);

  return {
    sourceFile: filePath,
    format: "plaintext",
    sections: [
      {
        heading: fileName,
        depth: 1,
        chunks: [{ content }],
      },
    ],
  };
};
