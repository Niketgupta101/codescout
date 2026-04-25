import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { RequestWithUser } from "../types/request-with-user.type";

export const authUserParamFactory = (data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequestWithUser>();
  return request.user;
};

export const UseAuthUser = createParamDecorator(authUserParamFactory);
