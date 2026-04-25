// raw HTTP request shape exposed by @rekog/mcp-nest as the third tool method argument
// undefined when the transport is stdio
export type McpToolRequest = {
  headers?: Record<string, string | string[] | undefined>;
};
