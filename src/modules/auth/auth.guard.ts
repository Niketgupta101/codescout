import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "./decorators/public.decorator";
import { getBearerToken } from "./auth.util";
import { AuthService } from "./auth.service";
import { RequestWithUser } from "./types/request-with-user.type";
import { UserApiKeyService } from "../user-api-key/user-api-key.service";
import { USER_API_KEY_PREFIX } from "../user-api-key/user-api-key.constants";
import { MCP_ENDPOINT_PATH } from "src/app.constants";
import { McpAuthService } from "../mcp-auth/mcp-auth.service";
import { EnvService } from "../env/env.service";
import { LocaleException } from "src/plugins/locale/nest/locale.exception";
import { Response } from "express";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    readonly reflector: Reflector,
    readonly authService: AuthService,
    readonly userApiKeyService: UserApiKeyService,
    readonly mcpAuthService: McpAuthService,
    readonly envService: EnvService,
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

    const normalizedPath = request.path.replace(/\/+$/, "");

    // mcp clients authenticate with stytch oauth and expect an oauth challenge on failure, not the rest jwt flow
    if (normalizedPath === MCP_ENDPOINT_PATH) {
      return this._activateMcpRequest(context, request);
    }

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

  async _activateMcpRequest(context: ExecutionContext, request: RequestWithUser): Promise<boolean> {
    try {
      const accessToken = getBearerToken(request);

      if (!accessToken) {
        throw LocaleException.unauthorized({ message: "module.mcp.missingAccessTokenError" });
      }

      request.user = await this.mcpAuthService.verifyToken({
        accessToken,
      });

      return true;
    } catch (error) {
      // rfc 9728 challenge: tells the mcp client where to discover the authorization server and start the stytch login
      const response = context.switchToHttp().getResponse<Response>();
      const appPublicUrl = this.envService.get("APP_PUBLIC_URL");

      response.setHeader(
        "WWW-Authenticate",
        `Bearer error="invalid_token", resource_metadata="${appPublicUrl}/.well-known/oauth-protected-resource"`,
      );

      throw error;
    }
  }
}
