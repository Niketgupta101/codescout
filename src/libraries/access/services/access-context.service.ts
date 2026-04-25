import { ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { AccessContext } from "../contexts/access.context";
import { MODULE_OPTIONS_TOKEN } from "../access.module-definition";
import { AccessModuleOptions } from "../types/access-module-options.type";
import { defaultAccessExceptionFactory } from "../factories/default-access-exception.factory";
import { RequestWithAccessContext } from "../types/request-with-access-context.type";
import { AccessCaslPrismaAbility, AccessCaslPrismaLikeAbility } from "../types/access-casl-prisma.type";

/**
 * Service that creates access contexts.
 */
@Injectable()
export class AccessContextService<TAbility extends AccessCaslPrismaLikeAbility = AccessCaslPrismaAbility> {
  constructor(@Inject(MODULE_OPTIONS_TOKEN) readonly options: AccessModuleOptions<TAbility>) {}

  createForContext(context: ExecutionContext): AccessContext<TAbility> {
    const request = context.switchToHttp().getRequest<RequestWithAccessContext>();
    const user = this.options.userFromRequest(request);

    return this.createForUser(user);
  }

  createForUser<TUser extends { id: string }>(user: TUser | undefined): AccessContext<TAbility> {
    const ability = this.options.abilityFactory.createAccessCaslAbility(user);
    const exceptionFactory = this.options.exceptionFactory ?? defaultAccessExceptionFactory;

    return new AccessContext(ability, exceptionFactory);
  }
}
