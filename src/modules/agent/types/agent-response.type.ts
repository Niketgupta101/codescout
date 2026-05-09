import { AgentIterationUsage } from "./agent-iteration-usage.type";
import { AgentResponseToolCall } from "./agent-response-tool-call.type";
import { AgentTokenUsage } from "./agent-token-usage.type";

export type AgentResponse = {
  answer: string;
  toolCalls: AgentResponseToolCall[];
  iterations: number;
  durationMs: number;
  // per-iteration LLM usage so callers can attribute tokens to the iteration that produced a given tool call
  iterationsUsage: AgentIterationUsage[];
  // tokens spent in the post-research answer-generation call; kept separate so it isn't conflated with research loop usage
  answerGenerationUsage: AgentTokenUsage;
  // sum of every LLM call this request triggered (research iterations + answer generation)
  totalUsage: AgentTokenUsage;
};
