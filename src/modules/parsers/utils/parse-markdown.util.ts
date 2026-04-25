import { readFileSync } from "fs";
import type { ParsedDocument } from "../types/parsed-document.type";
import type { ParsedSection } from "../types/parsed-section.type";
import type { ParsedChunk } from "../types/parsed-chunk.type";
import type { MarkdownSection } from "../types/markdown-section.type";
import { MAX_CHUNK_TOKENS } from "../parsers.constants";

export const parseMarkdown = (filePath: string): ParsedDocument => {
  const fileContent = readFileSync(filePath, "utf-8");
  const markdownSections = extractMarkdownSections(fileContent);

  const sections: ParsedSection[] = markdownSections.map((markdownSection) => {
    const chunks = chunkMarkdownSection(markdownSection);
    return {
      heading: markdownSection.header,
      depth: markdownSection.level,
      chunks,
    };
  });

  return {
    sourceFile: filePath,
    format: "markdown",
    rawContent: fileContent,
    sections,
  };
};

const extractMarkdownSections = (content: string): MarkdownSection[] => {
  const lines = content.split("\n");
  const sections: MarkdownSection[] = [];
  let currentSection: MarkdownSection | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^(#{1,6})\s+(.+)/);

    if (headerMatch) {
      // save previous section
      if (currentSection) {
        currentSection.endLine = i - 1;
        sections.push(currentSection);
      }

      // start new section
      const level = headerMatch[1].length;
      const header = headerMatch[2].trim();

      currentSection = {
        header,
        level,
        content: "",
        startLine: i,
        endLine: i,
      };
    } else if (currentSection && line.trim()) {
      // add content to current section
      currentSection.content += line + "\n";
    }
  }

  // push last section
  if (currentSection) {
    currentSection.endLine = lines.length - 1;
    sections.push(currentSection);
  }

  return sections;
};

const chunkMarkdownSection = (section: MarkdownSection): ParsedChunk[] => {
  const chunks: ParsedChunk[] = [];
  const estimatedTokens = estimateMarkdownTokens(section.content);

  if (estimatedTokens <= MAX_CHUNK_TOKENS) {
    // small enough, create single chunk
    chunks.push({
      content: `# ${section.header}\n\n${section.content}`,
      metadata: {
        heading: section.header,
        level: section.level,
        startLine: section.startLine,
        endLine: section.endLine,
        keywords: extractMarkdownKeywords(section.header + " " + section.content),
      },
    });
  } else {
    // need to split into multiple chunks
    const paragraphs = section.content.split("\n\n").filter((paragraph) => paragraph.trim());
    let currentChunk = "";
    let currentTokens = 0;
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
      const paragraphTokens = estimateMarkdownTokens(paragraph);

      if (currentTokens + paragraphTokens > MAX_CHUNK_TOKENS && currentTokens > 0) {
        // save current chunk and start new one
        chunks.push({
          content: `# ${section.header}\n\n${currentChunk}`,
          metadata: {
            heading: section.header,
            level: section.level,
            chunkIndex,
            startLine: section.startLine,
            endLine: section.endLine,
            keywords: extractMarkdownKeywords(section.header + " " + currentChunk),
          },
        });
        currentChunk = paragraph;
        currentTokens = paragraphTokens;
        chunkIndex++;
      } else {
        currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
        currentTokens += paragraphTokens;
      }
    }

    // save last chunk
    if (currentChunk.trim()) {
      chunks.push({
        content: `# ${section.header}\n\n${currentChunk}`,
        metadata: {
          heading: section.header,
          level: section.level,
          chunkIndex,
          startLine: section.startLine,
          endLine: section.endLine,
          keywords: extractMarkdownKeywords(section.header + " " + currentChunk),
        },
      });
    }
  }

  return chunks;
};

const estimateMarkdownTokens = (text: string): number => {
  // rough estimation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
};

const extractMarkdownKeywords = (text: string): string[] => {
  const keywords = new Set<string>();

  const technicalTerms = [
    "API",
    "authentication",
    "authorization",
    "database",
    "schema",
    "video",
    "generation",
    "AI",
    "model",
    "Runway",
    "Wan",
    "subscription",
    "payment",
    "tier",
    "billing",
    "IAP",
    "iOS",
    "Android",
    "mobile",
    "app",
    "platform",
    "user",
    "persona",
    "feature",
    "requirement",
    "specification",
    "workflow",
    "architecture",
    "design",
    "implementation",
    "upload",
    "download",
    "storage",
    "processing",
    "rendering",
  ];

  const lowerText = text.toLowerCase();

  for (const term of technicalTerms) {
    if (lowerText.includes(term.toLowerCase())) {
      keywords.add(term);
    }
  }

  // extract capitalized words
  const capitalizedWords = text.match(/\b[A-Z][a-z]+\b/g) ?? [];
  capitalizedWords.slice(0, 5).forEach((word) => keywords.add(word.toLowerCase()));

  return Array.from(keywords).slice(0, 10);
};
