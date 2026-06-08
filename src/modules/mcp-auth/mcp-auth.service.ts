import { Injectable, Logger } from "@nestjs/common";
import { StytchService } from "../stytch/stytch.service";
import { PrismaService } from "src/prisma/prisma.service";
import { AuthUser } from "../auth/types/auth-user.type";
import { LocaleException } from "src/plugins/locale/nest/locale.exception";

@Injectable()
export class McpAuthService {
  readonly logger = new Logger(McpAuthService.name);

  constructor(
    readonly stytchService: StytchService,
    readonly prismaService: PrismaService,
  ) {}

  async verifyToken({ accessToken }: { accessToken: string }): Promise<AuthUser> {
    const identity = await this.stytchService.verifyTokenAndGetIdentity(accessToken).catch((error: unknown) => {
      this.logger.warn("Stytch identity resolution failed", error);
      throw LocaleException.unauthorized({ message: "module.mcp.invalidAccessTokenError" });
    });

    // access is granted only to users that already exist and are enabled
    const user = await this.prismaService.user.findUnique({
      where: { email: identity.email.toLowerCase() },
    });

    if (!user?.enabled) {
      this.logger.warn("MCP oauth rejected: no enabled user for email", identity.email);
      throw LocaleException.unauthorized({ message: "module.mcp.userNotProvisionedError" });
    }

    return user;
  }
}
