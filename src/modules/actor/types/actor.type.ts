import { AppAbility } from "src/app-ability/app-ability.factory";
import { AccessContext } from "src/libraries/access";
import { AuthUser } from "src/modules/auth/types/auth-user.type";

export type Actor = AuthUser & {
  accessContext: AccessContext<AppAbility>;
};
