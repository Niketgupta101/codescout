import type { StoryMetadata } from "../types/node-metadata.type";

export function createStoryMetadata(
  params: {
    storyId: string;
    epicName: string;
  } & Partial<StoryMetadata>,
): StoryMetadata {
  return params;
}
