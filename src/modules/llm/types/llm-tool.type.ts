export type LLMToolParameter = {
  type: string;
  description?: string;
  enum?: string[];
  required?: boolean;
  // for arrays: shape of each element (recursive). both openai and anthropic accept this in their tool schema, mirrors json schema "items"
  items?: LLMToolParameter;
};

export type LLMTool = {
  name: string;
  description: string;
  parameters: Record<string, LLMToolParameter>;
  required?: string[];
};
