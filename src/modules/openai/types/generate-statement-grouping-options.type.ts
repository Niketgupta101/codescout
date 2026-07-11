import { ChatModel } from "openai/resources/shared";

export type GenerateStatementGroupingOptions = {
  // kept statement claims (textDerived) to group into doc-topics
  statements: string[];
  // allowed ProjectTopicType values for a group
  types: string[];
  model?: ChatModel;
};
