import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { RequestWithAccessContext } from "../types/request-with-access-context.type";
import { AccessContextService } from "../services/access-context.service";

/**
 * Guard to create access context for request, used internally.
 */
@Injectable()
export class AccessContextCreatorInternalGuard implements CanActivate {
  constructor(readonly accessContextService: AccessContextService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAccessContext>();

    // create access context
    request.accessContext = this.accessContextService.createForContext(context);

    return true;
  }
}
