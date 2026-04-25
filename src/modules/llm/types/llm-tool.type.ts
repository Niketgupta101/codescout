export type LLMToolParameter = {
  type: string;
  description?: string;
  enum?: string[];
  required?: boolean;
};

export type LLMTool = {
  name: string;
  description: string;
  parameters: Record<string, LLMToolParameter>;
  required?: string[];
};
