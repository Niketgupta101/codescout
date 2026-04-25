import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "./decorators/public.decorator";
import { getBearerToken } from "./auth.util";
import { AuthService } from "./auth.service";
import { RequestWithUser } from "./types/request-with-user.type";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    readonly reflector: Reflector,
    readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // allow public operations
    if (isPublic) {
      return true;
    }

    // get bearer token from request
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const accessToken = getBearerToken(request);
    if (!accessToken) {
      throw new UnauthorizedException("Token not found in request");
    }

    // verify bearer token and deserialize user
    const user = await this.authService.verifySession({ accessToken });

    // set user in request
    request.user = user;

    return true;
  }
}
