import { Injectable, Logger } from "@nestjs/common";
import { randomBytes } from "crypto";
import { Actor } from "../actor/types/actor.type";
import { AuthUser } from "../auth/types/auth-user.type";
import { LocaleException } from "src/plugins/locale/nest/locale.exception";
import { PrismaService } from "src/prisma/prisma.service";
import { createHash, verifyHash } from "src/utils/hash.util";
import { UserApiKeyCreateDto } from "./dto/user-api-key-create.dto";
import {
  USER_API_KEY_LOOKUP_PREFIX_LENGTH,
  USER_API_KEY_PREFIX,
  USER_API_KEY_SECRET_BYTES,
} from "./user-api-key.constants";

@Injectable()
export class UserApiKeyService {
  readonly logger = new Logger(UserApiKeyService.name);

  constructor(readonly prismaService: PrismaService) {}

  async create(userApiKeyCreateDto: UserApiKeyCreateDto, actor: Actor) {
    const secret = randomBytes(USER_API_KEY_SECRET_BYTES).toString("base64url");
    const fullKey = `${USER_API_KEY_PREFIX}${secret}`;
    const prefix = secret.substring(0, USER_API_KEY_LOOKUP_PREFIX_LENGTH);
    const keyHash = await createHash(fullKey);

    const apiKey = await this.prismaService.userApiKey.create({
      data: {
        userId: actor.id,
        name: userApiKeyCreateDto.name,
        prefix,
        keyHash,
      },
    });

    this.logger.log(`Created API key ${apiKey.id} for user ${actor.id} with prefix ${prefix}`);

    return { apiKey, key: fullKey };
  }

  async findAll(actor: Actor) {
    return this.prismaService.userApiKey.findMany({
      where: { userId: actor.id },
      orderBy: { createdAt: "desc" },
    });
  }

  async revoke(userApiKeyId: string, actor: Actor) {
    // scope by userId so users can only revoke their own keys, even with a guessed UUID
    const apiKey = await this.prismaService.userApiKey.findFirst({
      where: { id: userApiKeyId, userId: actor.id },
    });

    if (!apiKey) {
      throw LocaleException.notFound();
    }

    // already revoked — return as-is rather than churn the timestamp
    if (apiKey.revokedAt) {
      return apiKey;
    }

    return this.prismaService.userApiKey.update({
      where: { id: apiKey.id },
      data: { revokedAt: new Date() },
    });
  }

  // looks up a user by their full API key — used by McpActorService for non-JWT bearers
  // strict mode: revoked keys 401 immediately, no distinct error message
  async userFindByApiKey(fullKey: string): Promise<AuthUser> {
    if (!fullKey.startsWith(USER_API_KEY_PREFIX)) {
      throw LocaleException.unauthorized();
    }

    const secret = fullKey.substring(USER_API_KEY_PREFIX.length);
    const prefix = secret.substring(0, USER_API_KEY_LOOKUP_PREFIX_LENGTH);

    // multiple keys can share an indexed prefix on collision; argon2 verify resolves the actual match
    const candidates = await this.prismaService.userApiKey.findMany({
      where: {
        prefix,
        revokedAt: null,
      },
      include: { user: true },
    });

    for (const candidate of candidates) {
      const matched = await verifyHash(candidate.keyHash, fullKey);

      if (!matched) {
        continue;
      }

      // disabled or deleted users can't authenticate even with a valid key
      if (!candidate.user.enabled || candidate.user.deleted) {
        throw LocaleException.unauthorized();
      }

      // record last-used; failure here shouldn't block the auth path
      this.prismaService.userApiKey
        .update({
          where: { id: candidate.id },
          data: { lastUsedAt: new Date() },
        })
        .catch((error: unknown) => this.logger.error(`Failed to update lastUsedAt for API key ${candidate.id}`, error));

      return candidate.user;
    }

    throw LocaleException.unauthorized();
  }
}
