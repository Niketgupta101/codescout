export type ToolResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};
