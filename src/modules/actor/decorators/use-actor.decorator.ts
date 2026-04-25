import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { accessContextParamFactory } from "src/libraries/access";
import { authUserParamFactory } from "src/modules/auth/decorators/use-auth-user.decorator";
import { makeActor } from "../actor.factory";

export const actorParamFactory = (data: unknown, context: ExecutionContext) => {
  const user = authUserParamFactory(data, context);
  if (user) {
    const accessContext = accessContextParamFactory(data, context);
    return makeActor({ user, accessContext });
  }
};

/**
 * Injects the actor for the request as a param
 **/
export const UseActor = createParamDecorator(actorParamFactory);
