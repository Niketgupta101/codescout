import { Injectable, Logger } from "@nestjs/common";
import { Project } from "@prisma/client";
import { AppAbility } from "src/app-ability/app-ability.factory";
import { AccessContextService } from "src/libraries/access/services/access-context.service";
import { makeActor } from "src/modules/actor/actor.factory";
import { Actor } from "src/modules/actor/types/actor.type";
import { AuthService } from "src/modules/auth/auth.service";
import { AuthUser } from "src/modules/auth/types/auth-user.type";
import { EnvService } from "src/modules/env/env.service";
import { UserApiKeyService } from "src/modules/user-api-key/user-api-key.service";
import { USER_API_KEY_PREFIX } from "src/modules/user-api-key/user-api-key.constants";
import { LocaleException } from "src/plugins/locale/nest/locale.exception";
import { PrismaService } from "src/prisma/prisma.service";
import { McpProjectResolverInput } from "./types/mcp-project-resolver-input.type";
import { McpToolRequest } from "./types/mcp-tool-request.type";

const BEARER_PREFIX = /^Bearer\s+/i;

@Injectable()
export class McpActorService {
  readonly logger = new Logger(McpActorService.name);

  constructor(
    readonly authService: AuthService,
    readonly accessContextService: AccessContextService<AppAbility>,
    readonly envService: EnvService,
    readonly prismaService: PrismaService,
    readonly userApiKeyService: UserApiKeyService,
  ) {}

  async actorResolve(request: McpToolRequest | undefined): Promise<Actor> {
    const accessToken = this._accessTokenExtract(request);

    if (!accessToken) {
      this.logger.warn("MCP request rejected: missing access token");
      throw LocaleException.unauthorized({ message: "module.mcp.missingAccessTokenError" });
    }

    const user = await this._userResolveFromToken(accessToken);
    const accessContext = this.accessContextService.createForUser(user);
    return makeActor({ user, accessContext });
  }

  async _userResolveFromToken(accessToken: string): Promise<AuthUser> {
    // long-lived API keys carry the cck_ brand prefix; everything else is treated as a JWT
    // both paths return an AuthUser shape; api-key auth has session=undefined and is rejected by /me-style endpoints
    if (accessToken.startsWith(USER_API_KEY_PREFIX)) {
      return this.userApiKeyService.userFindByApiKey(accessToken);
    }

    return this.authService.verifySession({ accessToken });
  }

  /**
   * Finds a project by explicit ID or by matching a git remote URL, asserting the actor has read access.
   * Throws notFound when the project does not exist or the actor cannot access it.
   * @param input - Project identifier or git remote URL plus the actor for access checks
   * @returns Project ID
   */
  async projectFindOneForAccessCheck(input: McpProjectResolverInput): Promise<Pick<Project, "id">> {
    // ensure either project id or git remote url present
    if (!input.projectId && !input.gitRemoteUrl) {
      throw LocaleException.badRequest({ message: "module.mcp.missingProjectIdentifierError" });
    }

    const project = await this.prismaService.project.findFirst({
      where: {
        AND: [
          input.actor.accessContext.getWhereInputFor("read", "Project"),
          ...(input.projectId ? [{ id: input.projectId }] : []),
          ...(input.gitRemoteUrl ? [{ repositories: { some: { url: input.gitRemoteUrl } } }] : []),
        ],
      },
      select: { id: true },
    });

    if (!project) {
      throw LocaleException.notFound({ message: "module.mcp.projectNotFoundError" });
    }

    return project;
  }

  _accessTokenExtract(request: McpToolRequest | undefined): string | undefined {
    const headerValue = request?.headers?.authorization;
    const headerString = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (headerString) {
      return headerString.replace(BEARER_PREFIX, "");
    }

    return this.envService.get("MCP_AUTH_TOKEN");
  }
}
