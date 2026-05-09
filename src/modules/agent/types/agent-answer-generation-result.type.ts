import { AgentTokenUsage } from "./agent-token-usage.type";

// _generateAnswer needs to surface its own token cost separately from the research loop
// the formattedAnswer is the markdown-rendered string the caller embeds in the AgentResponse.answer field
export type AgentAnswerGenerationResult = {
  formattedAnswer: string;
  usage: AgentTokenUsage;
};
