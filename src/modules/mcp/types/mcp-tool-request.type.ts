import { AuthUser } from "src/modules/auth/types/auth-user.type";

export type McpToolRequest = {
  headers?: Record<string, string | string[] | undefined>;
  user?: AuthUser;
};
