import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { RequestWithAccessContext } from "../types/request-with-access-context.type";

export const accessContextParamFactory = (data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<RequestWithAccessContext>();
  if (!request.accessContext) {
    throw new Error("AccessContext requires the AccessModule to be registered");
  }
  return request.accessContext;
};

/**
 * Injects the access context for the request as a param
 **/
export const UseAccessContext = createParamDecorator(accessContextParamFactory);
