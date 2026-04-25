import { User, UserSession } from "@prisma/client";

export type AuthUser = User & {
  session: UserSession;
};
