import { AccessCaslAbilityFactory } from "./access-casl-ability-factory.type";
import { AccessExceptionFactory } from "./access-exception-factory.type";
import { AccessCaslPrismaLikeAbility } from "./access-casl-prisma.type";
import { AccessUserFromRequestFunction } from "./access-user-from-request.type";

export type AccessModuleOptions<
  TAbility extends AccessCaslPrismaLikeAbility = AccessCaslPrismaLikeAbility,
  TUser extends { id: string } = { id: string },
> = {
  userFromRequest: AccessUserFromRequestFunction<TUser>;
  abilityFactory: AccessCaslAbilityFactory<TAbility>;
  exceptionFactory?: AccessExceptionFactory;
};
