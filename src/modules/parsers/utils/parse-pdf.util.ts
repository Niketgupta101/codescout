import * as path from "path";
import type { ParsedDocument } from "../types/parsed-document.type";
import { CHARS_PER_CHUNK } from "../parsers.constants";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import pdfParse = require("pdf-parse");

export const parsePdf = async (filePath: string, content: Buffer): Promise<ParsedDocument> => {
  const fileName = path.basename(filePath);

  const pdfData = (await pdfParse(content)) as { text: string; numpages: number };
  const fullText: string = pdfData.text;
  const chunks = chunkPdfText(fullText);

  return {
    sourceFile: filePath,
    format: "pdf",
    rawContent: fullText,
    sections: [
      {
        heading: fileName,
        depth: 1,
        chunks,
      },
    ],
  };
};

const chunkPdfText = (text: string): { content: string }[] => {
  const chunks = [];
  const totalLength = text.length;
  let currentPosition = 0;

  while (currentPosition < totalLength) {
    const chunkEnd = Math.min(currentPosition + CHARS_PER_CHUNK, totalLength);
    const chunkText = text.substring(currentPosition, chunkEnd);

    chunks.push({ content: chunkText });
    currentPosition = chunkEnd;
  }

  return chunks;
};
