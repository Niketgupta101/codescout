import { ForbiddenException, HttpException, NotFoundException } from "@nestjs/common";
import { AccessExceptionFactory } from "../types/access-exception-factory.type";

/**
 * Default access exception factory. Throws 404 for resource level conditional error, 403 for everything else.
 **/
export const defaultAccessExceptionFactory: AccessExceptionFactory = (error, decision) =>
  error instanceof HttpException
    ? error
    : decision?.conditional && !decision?.context?.field
      ? new NotFoundException(undefined, { cause: error })
      : new ForbiddenException(
          decision?.context?.field
            ? `You do not have authorization to ${decision.context.action} "${decision.context.field}" on this resource`
            : decision?.context
              ? `You do not have authorization to ${decision.context.action} this resource`
              : undefined,
          { cause: error },
        );
