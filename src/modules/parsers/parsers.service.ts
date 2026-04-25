import { Injectable, Logger } from "@nestjs/common";
import * as path from "path";
import type { ParsedDocument } from "./types/parsed-document.type";
import { parseUserStories } from "./utils/parse-user-stories.util";
import { parseMarkdown } from "./utils/parse-markdown.util";
import { parseTypescript } from "./utils/parse-typescript.util";
import { parsePlainText } from "./utils/parse-plain-text.util";
import { parseJson } from "./utils/parse-json.util";
import { parseYaml } from "./utils/parse-yaml.util";
import { parsePrisma } from "./utils/parse-prisma.util";
import { parsePdf } from "./utils/parse-pdf.util";

@Injectable()
export class ParsersService {
  readonly logger = new Logger(ParsersService.name);

  parseDocument(
    filePath: string,
    format?: string,
    content?: string | Buffer,
  ): ParsedDocument | Promise<ParsedDocument> {
    const detectedFormat = format ?? this.detectFormat(filePath);

    this.logger.log(`Parsing document: ${filePath} (${detectedFormat})`);

    switch (detectedFormat.toLowerCase()) {
      case "csv":
        return parseUserStories(filePath);

      case "markdown":
        return parseMarkdown(filePath);

      case "typescript":
        if (!content || typeof content !== "string") {
          throw new Error("String content is required for TypeScript parsing");
        }
        return parseTypescript(filePath, content);

      case "json":
        if (!content || typeof content !== "string") {
          throw new Error("String content is required for JSON parsing");
        }
        return parseJson(filePath, content);

      case "yaml":
        if (!content || typeof content !== "string") {
          throw new Error("String content is required for YAML parsing");
        }
        return parseYaml(filePath, content);

      case "prisma":
        if (!content || typeof content !== "string") {
          throw new Error("String content is required for Prisma parsing");
        }
        return parsePrisma(filePath, content);

      case "pdf":
        if (!content || !Buffer.isBuffer(content)) {
          throw new Error("Buffer content is required for PDF parsing");
        }
        return parsePdf(filePath, content);

      case "plaintext":
        if (!content || typeof content !== "string") {
          throw new Error("String content is required for plain text parsing");
        }
        return parsePlainText(filePath, content);

      default:
        throw new Error(`Unsupported document format: ${detectedFormat}`);
    }
  }

  detectFormat(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath);

    if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) return "typescript";
    if (ext === ".json") return "json";
    if ([".yml", ".yaml"].includes(ext)) return "yaml";
    if (ext === ".prisma") return "prisma";
    if (ext === ".pdf") return "pdf";
    if ([".md", ".markdown"].includes(ext)) return "markdown";
    if (ext === ".csv") return "csv";
    if ([".gitignore", ".env", ".example", ".npmrc", ".nvmrc"].includes(basename) || basename.startsWith(".")) {
      return "plaintext";
    }

    // fallback to plain text
    return "plaintext";
  }

  isFormatSupported(format: string): boolean {
    return ["csv", "markdown", "typescript", "json", "yaml", "prisma", "pdf", "plaintext"].includes(
      format.toLowerCase(),
    );
  }
}
