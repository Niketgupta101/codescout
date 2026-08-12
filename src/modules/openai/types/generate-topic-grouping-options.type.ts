import { ProjectTopic } from "@prisma/client";
import { ChatModel } from "openai/resources/shared";

export type GenerateTopicGroupingOptions = {
  projectTopicsExisting: ProjectTopic[];
  projectDocumentTopics: { name: string; statements: string[]; candidateTopicIds?: string[] }[];
  model?: ChatModel;
};
