import { ChatModel } from "openai/resources/shared";

export type GenerateStatementSupersessionJudgmentOptions = {
  // the newer statement that may replace the prior one
  newStatement: string;
  // a candidate earlier statement
  priorStatement: string;
  // the new statement's local hint about what it changes
  hint: string;
  model?: ChatModel;
};
