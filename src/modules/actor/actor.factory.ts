import { AccessContext } from "src/libraries/access";
import { AuthUser } from "../auth/types/auth-user.type";
import { Actor } from "./types/actor.type";
import { AppAbility } from "src/app-ability/app-ability.factory";

export const makeActor = ({
  user,
  accessContext,
}: {
  user: AuthUser;
  accessContext: AccessContext<AppAbility>;
}): Actor => ({
  ...user,
  accessContext,
});
