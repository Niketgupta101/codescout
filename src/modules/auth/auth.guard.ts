import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "./decorators/public.decorator";
import { getBearerToken } from "./auth.util";
import { AuthService } from "./auth.service";
import { RequestWithUser } from "./types/request-with-user.type";
import { UserApiKeyService } from "../user-api-key/user-api-key.service";
import { USER_API_KEY_PREFIX } from "../user-api-key/user-api-key.constants";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    readonly reflector: Reflector,
    readonly authService: AuthService,
    readonly userApiKeyService: UserApiKeyService,
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

    // long-lived API keys carry the cck_ brand prefix; everything else is treated as a JWT
    // both paths return AuthUser; api-key auth leaves session undefined and is rejected by /me-style endpoints
    const user = accessToken.startsWith(USER_API_KEY_PREFIX)
      ? await this.userApiKeyService.userFindByApiKey(accessToken)
      : await this.authService.verifySession({ accessToken });

    // set user in request
    request.user = user;

    return true;
  }
}
