import { ChatModel } from "openai/resources/shared";

export type GenerateTopicGroupingOptions = {
  // existing canonical topics to fold matching inputs into rather than minting a near-duplicate
  existingTopics: { id: string; name: string; summary: string | null }[];
  // doc-topics to place, each with a sample of its statements
  topics: { name: string; statements: string[] }[];
  // allowed ProjectTopicType values for a newly created group
  types: string[];
  model?: ChatModel;
};
