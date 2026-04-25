import * as path from "path";
import type { ParsedDocument } from "../types/parsed-document.type";

export const parsePrisma = (filePath: string, content: string): ParsedDocument => {
  const fileName = path.basename(filePath);
  const chunks = [];

  const datasourceChunks = extractPrismaDatasourceBlocks(content);
  chunks.push(...datasourceChunks);

  const generatorChunks = extractPrismaGeneratorBlocks(content);
  chunks.push(...generatorChunks);

  const enumChunks = extractPrismaEnumBlocks(content);
  chunks.push(...enumChunks);

  const modelChunks = extractPrismaModelBlocks(content);
  chunks.push(...modelChunks);

  return {
    sourceFile: filePath,
    format: "prisma",
    sections: [
      {
        heading: fileName,
        depth: 1,
        chunks,
      },
    ],
  };
};

const extractPrismaDatasourceBlocks = (content: string) => {
  const chunks = [];
  const datasourceRegex = /datasource\s+(\w+)\s*\{([^}]+)\}/g;
  let match;

  while ((match = datasourceRegex.exec(content)) !== null) {
    chunks.push({
      content: match[0],
      metadata: {
        fileType: "prisma",
        elementType: "datasource",
        name: match[1],
      },
    });
  }

  return chunks;
};

const extractPrismaGeneratorBlocks = (content: string) => {
  const chunks = [];
  const generatorRegex = /generator\s+(\w+)\s*\{([^}]+)\}/g;
  let match;

  while ((match = generatorRegex.exec(content)) !== null) {
    chunks.push({
      content: match[0],
      metadata: {
        fileType: "prisma",
        elementType: "generator",
        name: match[1],
      },
    });
  }

  return chunks;
};

const extractPrismaEnumBlocks = (content: string) => {
  const chunks = [];
  const enumRegex = /enum\s+(\w+)\s*\{([^}]+)\}/g;
  let match;

  while ((match = enumRegex.exec(content)) !== null) {
    const enumName = match[1];
    const enumValues = match[2]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("//"));

    chunks.push({
      content: match[0],
      metadata: {
        fileType: "prisma",
        elementType: "enum",
        name: enumName,
        valueCount: enumValues.length,
      },
    });
  }

  return chunks;
};

const extractPrismaModelBlocks = (content: string) => {
  const chunks = [];
  const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
  let match;

  while ((match = modelRegex.exec(content)) !== null) {
    const modelName = match[1];
    const modelBody = match[2];

    const fieldLines = modelBody.split("\n").filter((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith("//") && !trimmed.startsWith("@@");
    });

    chunks.push({
      content: match[0],
      metadata: {
        fileType: "prisma",
        elementType: "model",
        name: modelName,
        fieldCount: fieldLines.length,
      },
    });
  }

  return chunks;
};
