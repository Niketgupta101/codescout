import { Injectable, Logger } from "@nestjs/common";
import { Project } from "@prisma/client";
import { AppAbility } from "src/app-ability/app-ability.factory";
import { AccessContextService } from "src/libraries/access/services/access-context.service";
import { makeActor } from "src/modules/actor/actor.factory";
import { Actor } from "src/modules/actor/types/actor.type";
import { LocaleException } from "src/plugins/locale/nest/locale.exception";
import { PrismaService } from "src/prisma/prisma.service";
import { McpProjectResolverInput } from "./types/mcp-project-resolver-input.type";
import { McpToolRequest } from "./types/mcp-tool-request.type";

@Injectable()
export class McpActorService {
  readonly logger = new Logger(McpActorService.name);

  constructor(
    readonly accessContextService: AccessContextService<AppAbility>,
    readonly prismaService: PrismaService,
  ) {}

  async actorResolve(request: McpToolRequest | undefined): Promise<Actor> {
    const user = request?.user;

    if (!user) {
      throw LocaleException.unauthorized();
    }

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
}
