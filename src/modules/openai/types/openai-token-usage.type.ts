// outputTokens is 0 for embedding calls (the embedding API only counts input)
export type OpenAiTokenUsage = {
  inputTokens: number;
  outputTokens: number;
};
