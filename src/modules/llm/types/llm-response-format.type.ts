export type LLMResponseFormat = {
  type: "json_schema";
  json_schema: {
    name: string;
    strict?: boolean;
    schema: Record<string, unknown>;
  };
};
