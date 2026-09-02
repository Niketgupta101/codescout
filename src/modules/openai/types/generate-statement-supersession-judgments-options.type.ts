import { ChatModel } from "openai/resources/shared";

export type StatementSupersessionItem = {
  statement: string;
  candidateRole: "prior" | "new";
  hint?: string | null;
  candidates: { id: string; text: string }[];
};

export type GenerateStatementSupersessionJudgmentsOptions = {
  items: StatementSupersessionItem[];
  model?: ChatModel;
};
