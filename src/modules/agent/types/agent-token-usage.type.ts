// shape returned by every LLMChatResponse, carried through the agent loop and into the public response
// matches openai's prompt/completion split rather than anthropic's input/output to avoid a per-provider rename
export type AgentTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  // subset of promptTokens that came from the provider's prompt cache — useful for measuring cache effectiveness across iterations
  cachedPromptTokens: number;
};
