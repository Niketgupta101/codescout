// the usage block as it arrives on the wire, which is where usage is recorded from - the sdk's own response types
// differ per endpoint and carry no shared shape to narrow against
export type OpenAiWireUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
};
