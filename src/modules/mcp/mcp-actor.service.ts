import { Injectable, Logger } from "@nestjs/common";
import { Project } from "@prisma/client";
import { AppAbility } from "src/app-ability/app-ability.factory";
import { AccessContextService } from "src/libraries/access/services/access-context.service";
import { makeActor } from "src/modules/actor/actor.factory";
import { Actor } from "src/modules/actor/types/actor.type";
import { AuthService } from "src/modules/auth/auth.service";
import { EnvService } from "src/modules/env/env.service";
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
  ) {}

  /**
   * Resolves an actor from the MCP request.
   * Reads the JWT from the Authorization header (HTTP+SSE) or the MCP_AUTH_TOKEN env var (stdio).
   * @param request - Raw HTTP request from the MCP transport, undefined for stdio
   * @returns Actor for downstream service calls
   */
  async actorResolve(request: McpToolRequest | undefined): Promise<Actor> {
    const accessToken = this._accessTokenExtract(request);

    if (!accessToken) {
      this.logger.warn("MCP request rejected: missing access token");
      throw LocaleException.unauthorized({ message: "module.mcp.missingAccessTokenError" });
    }

    const user = await this.authService.verifySession({ accessToken });
    const accessContext = this.accessContextService.createForUser(user);
    return makeActor({ user, accessContext });
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
