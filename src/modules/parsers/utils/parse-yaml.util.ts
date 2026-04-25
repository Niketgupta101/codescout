import * as path from "path";
import * as yaml from "js-yaml";
import type { ParsedDocument } from "../types/parsed-document.type";

export const parseYaml = (filePath: string, content: string): ParsedDocument => {
  const fileName = path.basename(filePath);

  try {
    const parsed = yaml.load(content) as Record<string, unknown>;

    if (!parsed || typeof parsed !== "object") {
      return createYamlFallbackDocument(filePath, fileName, content);
    }

    const chunkContent = yaml.dump(parsed, { indent: 2, lineWidth: 120 });

    return {
      sourceFile: filePath,
      format: "yaml",
      sections: [
        {
          heading: fileName,
          depth: 1,
          chunks: [{ content: chunkContent }],
        },
      ],
    };
  } catch {
    return createYamlFallbackDocument(filePath, fileName, content);
  }
};

const createYamlFallbackDocument = (filePath: string, fileName: string, content: string): ParsedDocument => {
  return {
    sourceFile: filePath,
    format: "yaml",
    sections: [
      {
        heading: fileName,
        depth: 1,
        chunks: [{ content }],
      },
    ],
  };
};
