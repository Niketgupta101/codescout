import { Injectable, CanActivate, ExecutionContext, Inject, Type } from "@nestjs/common";
import { ModuleRef, Reflector } from "@nestjs/core";
import { AccessExceptionFactory } from "../types/access-exception-factory.type";
import { MODULE_OPTIONS_TOKEN } from "../access.module-definition";
import { AccessModuleOptions } from "../types/access-module-options.type";
import { defaultAccessExceptionFactory } from "../factories/default-access-exception.factory";
import { RequestWithAccessContext } from "../types/request-with-access-context.type";
import { AccessConditionDecider } from "../types/access-condition-decider.type";
import { USE_ACCESS_CONDITION_KEY } from "../decorators/use-access-condition.decorator";
import { accessContextParamFactory } from "../decorators/use-access-context.decorator";

/**
 * Guard to enforce access condition.
 * Analogous to PEP or Policy Enforcement Point
 */
@Injectable()
export class AccessGuard implements CanActivate {
  exceptionFactory: AccessExceptionFactory;

  constructor(
    readonly reflector: Reflector,
    readonly moduleRef: ModuleRef,
    @Inject(MODULE_OPTIONS_TOKEN) readonly options: AccessModuleOptions,
  ) {
    this.exceptionFactory = options.exceptionFactory ?? defaultAccessExceptionFactory;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // get condition decider
    const deciderType = this.reflector.getAllAndOverride<Type<AccessConditionDecider> | undefined>(
      USE_ACCESS_CONDITION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // skip if condition decider not set
    if (!deciderType) {
      return true;
    }

    // create decider and check access
    const decider = await this.moduleRef.create(deciderType);
    const accessContext = accessContextParamFactory(undefined, context);
    const request = context.switchToHttp().getRequest<RequestWithAccessContext>();

    const { granted, ...decision } = await decider.decideAccessCondition(accessContext.ability, request);
    if (granted) {
      return true;
    }

    // request access not granted
    throw this.exceptionFactory(`${deciderType.name} did not grant access to this request`, decision);
  }
}
