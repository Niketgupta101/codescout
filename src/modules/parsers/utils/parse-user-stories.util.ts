import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import type { ParsedDocument } from "../types/parsed-document.type";
import type { ParsedSection } from "../types/parsed-section.type";
import type { ParsedChunk } from "../types/parsed-chunk.type";
import type { UserStoryRow } from "../types/user-story-row.type";
import type { EpicInfo } from "../types/epic-info.type";
import { createStoryMetadata } from "../../../utils/metadata.util";

export const parseUserStories = (filePath: string): ParsedDocument => {
  const fileContent = readFileSync(filePath, "utf-8");
  const rows = parse(fileContent, {
    skip_empty_lines: true,
    relax_column_count: true,
  });

  const sections: ParsedSection[] = [];
  let currentEpic: EpicInfo | null = null;
  let currentStories: ParsedChunk[] = [];
  let storyCounter = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // skip header row
    if (i === 0 && row[0]?.toLowerCase().includes("epic")) {
      continue;
    }

    if (isUserStoryEpicRow(row)) {
      // save previous epic section if exists
      if (currentEpic && currentStories.length > 0) {
        sections.push({
          heading: currentEpic.name,
          depth: 1,
          chunks: currentStories,
        });
      }

      // start new epic
      const epicText = (row[0]?.toLowerCase().includes("epic") ? row[0] : row[1]).trim();
      const epicName = extractUserStoryEpicName(epicText);

      currentEpic = {
        name: epicName,
        rawText: epicText,
      };

      currentStories = [];
      storyCounter = 0;
    } else if (isUserStoryContentRow(row) && currentEpic) {
      // parse user story
      storyCounter++;
      const story = parseUserStoryRowData(row);
      const storyId = `${currentEpic.name}-Story${storyCounter}`;

      const content = buildUserStoryContent(story);
      const keywords = extractUserStoryKeywords(content);

      currentStories.push({
        content,
        metadata: createStoryMetadata({
          storyId,
          epicName: currentEpic.name,
          userRole: story.userRole,
          action: story.userGoal,
          benefit: story.businessValue,
          acceptanceCriteria: story.acceptanceCriteria ? [story.acceptanceCriteria] : undefined,
          keywords,
        }),
      });
    }
  }

  // add final epic section
  if (currentEpic && currentStories.length > 0) {
    sections.push({
      heading: currentEpic.name,
      depth: 1,
      chunks: currentStories,
    });
  }

  return {
    sourceFile: filePath,
    format: "csv",
    rawContent: fileContent,
    sections,
  };
};

const isUserStoryEpicRow = (row: string[]): boolean => {
  // epic row can have Epic in column 0 OR column 1 (with column 0 empty)
  if (
    row[0]?.trim().length > 0 &&
    row[0].toLowerCase().includes("epic") &&
    row.slice(1).every((col) => !col || col.trim().length === 0)
  ) {
    return true;
  }

  return (
    (!row[0]?.trim() || row[0]?.toLowerCase().includes("summary")) &&
    row[1]?.trim().length > 0 &&
    row[1].toLowerCase().includes("epic") &&
    row.slice(2).every((col) => !col || col.trim().length === 0)
  );
};

const extractUserStoryEpicName = (epicText: string): string => {
  const match = epicText.match(/Epic\s*\d+:\s*(.+)/i);
  if (match) {
    return match[1].trim().replace(/\s+/g, "");
  }
  return epicText
    .replace(/Epic\s*\d+:\s*/i, "")
    .trim()
    .replace(/\s+/g, "");
};

const isUserStoryContentRow = (row: string[]): boolean => {
  return row[1]?.trim().length > 0 || row[2]?.trim().length > 0;
};

const parseUserStoryRowData = (row: string[]): UserStoryRow => {
  return {
    epicSummary: row[0]?.trim() || "",
    userRole: row[1]?.trim() || "",
    userGoal: row[2]?.trim() || "",
    businessValue: row[3]?.trim() || "",
    desiredFlow: row[4]?.trim() || "",
    currentFlow: row[5]?.trim() || "",
    acceptanceCriteria: row[6]?.trim() || "",
    assumptions: row[7]?.trim() || "",
    thingsNotCovered: row[8]?.trim() || "",
  };
};

const buildUserStoryContent = (story: UserStoryRow): string => {
  const parts: string[] = [];

  if (story.userRole && story.userGoal && story.businessValue) {
    parts.push(`As a ${story.userRole}, I want to ${story.userGoal} so that ${story.businessValue}.`);
  }

  if (story.desiredFlow) {
    parts.push(`\nDesired Flow:\n${story.desiredFlow}`);
  }

  if (story.acceptanceCriteria) {
    parts.push(`\nAcceptance Criteria:\n${story.acceptanceCriteria}`);
  }

  if (story.assumptions) {
    parts.push(`\nAssumptions:\n${story.assumptions}`);
  }

  return parts.join("\n");
};

const extractUserStoryKeywords = (text: string): string[] => {
  const keywords = new Set<string>();

  const technicalTerms = [
    "authentication",
    "auth",
    "login",
    "signup",
    "password",
    "email",
    "SSO",
    "OAuth",
    "JWT",
    "token",
    "session",
    "OTP",
    "video",
    "upload",
    "image",
    "generation",
    "AI",
    "scene",
    "subscription",
    "payment",
    "tier",
    "billing",
    "IAP",
    "profile",
    "user",
    "account",
    "settings",
    "library",
    "gallery",
    "download",
    "share",
    "delete",
    "bin",
    "trash",
    "recovery",
    "restore",
  ];

  const lowerText = text.toLowerCase();

  for (const term of technicalTerms) {
    if (lowerText.includes(term.toLowerCase())) {
      keywords.add(term);
    }
  }

  const capitalizedWords = text.match(/\b[A-Z][a-z]+\b/g) ?? [];
  capitalizedWords.slice(0, 5).forEach((word) => keywords.add(word.toLowerCase()));

  return Array.from(keywords).slice(0, 10);
};
