import { User, UserSession } from "@prisma/client";

// session is present when the request was authenticated via JWT (login + refresh flow)
// API-key authentication populates the user but no session — consumers that need session must runtime-check
export type AuthUser = User & {
  session?: UserSession;
};
