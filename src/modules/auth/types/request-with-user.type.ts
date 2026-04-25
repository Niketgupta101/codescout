import { Request } from "express";
import { AuthUser } from "./auth-user.type";

export type RequestWithUser = Request & {
  user?: AuthUser;
};
