import { AgentTokenUsage } from "../types/agent-token-usage.type";

const ZERO_USAGE: AgentTokenUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
};

// sums an arbitrary list of AgentTokenUsage entries; safe on an empty list (returns zeros)
// extracted so the agent service can build totalUsage without inline reducer noise
export const sumAgentTokenUsage = (usages: AgentTokenUsage[]): AgentTokenUsage => {
  return usages.reduce<AgentTokenUsage>(
    (accumulator, current) => ({
      promptTokens: accumulator.promptTokens + current.promptTokens,
      completionTokens: accumulator.completionTokens + current.completionTokens,
      totalTokens: accumulator.totalTokens + current.totalTokens,
    }),
    { ...ZERO_USAGE },
  );
};
