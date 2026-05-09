import { AgentTokenUsage } from "./agent-token-usage.type";

// per-loop accounting: one LLM call per iteration, that call may have produced N tool calls (or zero, in which case the loop exits)
// toolCallIds lets callers cross-reference which AgentResponseToolCall entries originated from this iteration's LLM decision
export type AgentIterationUsage = {
  iteration: number;
  toolCallIds: string[];
  usage: AgentTokenUsage;
};
