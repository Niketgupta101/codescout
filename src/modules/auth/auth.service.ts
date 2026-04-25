import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { EnvService } from "../env/env.service";
import { LoginDto } from "./dto/login.dto";
import { createHash, verifyHash } from "src/utils/hash.util";
import { DateTime, Duration } from "luxon";
import ms from "ms";
import { User } from "@prisma/client";
import { Cron, CronExpression } from "@nestjs/schedule";
import { getPasswordAttemptsTimeoutMs } from "./auth.util";
import { randomBytes } from "crypto";
import { AuthUser } from "./types/auth-user.type";
import { AuthResponseEntity } from "./entities/auth-response.entity";
import { JwtService } from "@nestjs/jwt";
import { randomLargeId } from "src/utils/random.util";
import { AuthAccessCredentials, AuthRefreshCredentials } from "./types/auth.type";
import { CookieOptions, Request, Response } from "express";
import { AccessTokenPayload } from "src/types/access-token-payload.type";
import { COOKIE_REFRESH_TOKEN, COOKIE_SESSION_ID } from "./auth.constants";
import { AuthRefreshDto } from "./dto/auth-refresh.dto";
import { AuthCookies } from "./types/auth-cookies.type";
import { AuthLogoutDto } from "./dto/auth-logout.dto";
import { PrismaService } from "src/prisma/prisma.service";
import { LocaleException } from "src/plugins/locale/nest/locale.exception";
import { PASSWORD_REGEX } from "src/app.constants";
import { LocaleString } from "src/plugins/locale/locale-string";

@Injectable()
export class AuthService {
  readonly logger = new Logger(AuthService.name);
  readonly accessTokenSecret: Buffer;
  readonly jwtSecret: Buffer;
  constructor(
    readonly prismaService: PrismaService,
    readonly envService: EnvService,
    readonly jwtService: JwtService,
  ) {
    this.accessTokenSecret = Buffer.from(envService.get("ACCESS_TOKEN_SECRET_BASE64"), "base64");

    // ensure a strong access token secret is set
    if (this.accessTokenSecret.length < 32) {
      throw new Error("The auth signer secret length must be at least 32 bytes");
    }
  }

  async _generateRefreshCredentials(): Promise<AuthRefreshCredentials> {
    const refreshToken = randomBytes(128).toString("base64url");
    const refreshTokenExpiresAt = new Date(Date.now() + ms(this.envService.get("REFRESH_TOKEN_EXPIRES_IN")));

    return { refreshToken, refreshTokenExpiresAt };
  }

  async _generateAccessCredentials(sessionId: string): Promise<AuthAccessCredentials> {
    const id = sessionId;
    const payload: AccessTokenPayload = { sessionId };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.accessTokenSecret,
      expiresIn: this.envService.get("ACCESS_TOKEN_EXPIRES_IN"),
    });

    const accessTokenExpiresAt = DateTime.fromSeconds(
      this.jwtService.decode<{ exp: number }>(accessToken).exp,
    ).toJSDate();
    
    return { id, accessToken, accessTokenExpiresAt };
  }

  _setCookies(
    sessionId: string,
    { refreshToken, refreshTokenExpiresAt }: AuthRefreshCredentials,
    res: Pick<Response, "cookie">,
  ) {
    const options: CookieOptions = this.envService.get("SECURE_COOKIES", true)
      ? {
          httpOnly: true,
          secure: true,
          sameSite: "none", // requires secure
        }
      : {};

    // set auth cookies
    res.cookie(COOKIE_SESSION_ID, sessionId, { ...options, path: "v1/auth", expires: refreshTokenExpiresAt });
    res.cookie(COOKIE_REFRESH_TOKEN, refreshToken, {
      ...options,
      path: "v1/auth",
      expires: refreshTokenExpiresAt,
    });
  }

  _clearCookies(res: Pick<Response, "clearCookie">) {
    const options: CookieOptions = this.envService.get("SECURE_COOKIES", true)
      ? {
          httpOnly: true,
          secure: true,
          sameSite: "none", // requires secure
        }
      : {};

    // clear auth cookies
    res.clearCookie(COOKIE_SESSION_ID, { ...options, path: "v1/auth" });
    res.clearCookie(COOKIE_REFRESH_TOKEN, { ...options, path: "v1/auth" });
  }

  async _createUserSessionWithAccessAndRefreshCredentials(userId: string): Promise<{
    userSessionId: string;
    refreshCredentials: AuthRefreshCredentials;
    accessCredentials: AuthAccessCredentials;
  }> {
    // create refresh credentials
    const refreshCredentials = await this._generateRefreshCredentials();

    // create user session
    const userSession = await this.prismaService.userSession.create({
      data: {
        id: randomLargeId(),
        userId: userId,
        refreshTokenHash: await createHash(refreshCredentials.refreshToken),
        refreshTokenExpiresAt: refreshCredentials.refreshTokenExpiresAt,
      },
    });

    // create access credentials
    const accessCredentials = await this._generateAccessCredentials(userSession.id);

    return {
      userSessionId: userSession.id,
      refreshCredentials,
      accessCredentials,
    };
  }

  async login(res: Pick<Response, "cookie">, { email, password, issue }: LoginDto): Promise<AuthResponseEntity> {
    // find user
    const user = await this.prismaService.user.findUnique({
      where: {
        email: email.toLowerCase(),
        enabled: true,
        deleted: false,
      },
    });

    if (!user) {
      throw LocaleException.unauthorized({
        message: "module.auth.emailOrPasswordIncorrectError",
        cause: "User with email not found",
      });
    }

    // verify password
    await this.verifyPassword({ userId: user.id, password });

    // create user session
    const { userSessionId, refreshCredentials, accessCredentials } =
      await this._createUserSessionWithAccessAndRefreshCredentials(user.id);

    if (issue === "body") {
      // return credentials in response body
      return {
        auth: {
          ...accessCredentials,
          ...refreshCredentials,
          id: userSessionId,
        },
      };
    } else {
      // return refresh credentials in response cookie
      this._setCookies(userSessionId, refreshCredentials, res);

      return {
        auth: {
          ...accessCredentials,
          id: userSessionId,
        },
      };
    }
  }

  async findAllExpiredSessions({ userSessionIds }: { userSessionIds: string[] }): Promise<string[]> {
    // find active user sessions
    const activeUserSessions = await this.prismaService.userSession.findMany({
      where: {
        id: { in: userSessionIds },
        refreshTokenExpiresAt: { gt: new Date() },
        user: {
          enabled: true,
          deleted: false,
        },
      },
      select: {
        id: true,
      },
    });

    // find active user session ids
    const activeUserSessionIds = activeUserSessions.map((it) => it.id);

    // find expired user session ids
    const expiredUserSessionIds = userSessionIds.filter((it) => !activeUserSessionIds.includes(it));

    return expiredUserSessionIds;
  }

  async verifySession({ accessToken }: { accessToken: string }): Promise<AuthUser> {
    try {
      // verify access token and get user session id
      const { sessionId: userSessionId } = this.jwtService.verify<AccessTokenPayload & { exp: number }>(accessToken, {
        secret: this.accessTokenSecret,
      });

      // verify user session
      const userSession = await this.prismaService.userSession.findUniqueOrThrow({
        where: {
          id: userSessionId,
          refreshTokenExpiresAt: { gt: new Date() },
          user: {
            enabled: true,
            deleted: false,
          },
        },
        include: {
          user: true,
        },
      });

      // return user
      const { user, ...rest } = userSession;
      return {
        ...user,
        session: rest,
      };
    } catch (error) {
      throw LocaleException.unauthorized({ cause: error });
    }
  }

  async verifyPassword({ userId, password }: { userId: string; password: string }): Promise<User> {
    // find user credential
    const userPassword = await this.prismaService.userPassword.findUnique({
      where: {
        userId,
        user: {
          enabled: true,
          deleted: false,
        },
      },
      include: {
        user: true,
      },
    });

    if (!userPassword) {
      throw LocaleException.unauthorized({
        message: "module.auth.emailOrPasswordIncorrectError",
        cause: "User password does not exist",
      });
    }

    // throttle attempts
    const passwordAttemptsTimeoutMs = getPasswordAttemptsTimeoutMs(userPassword);
    if (userPassword.lastAttemptedAt.valueOf() + passwordAttemptsTimeoutMs > new Date().valueOf()) {
      const message = new LocaleString("module.auth.authThrottledTryAgainAfterMinutesError", {
        duration: Duration.fromMillis(passwordAttemptsTimeoutMs).toFormat("m"),
      });
      throw new LocaleException(message, HttpStatus.TOO_MANY_REQUESTS);
    }

    // verify password
    if (!(await verifyHash(userPassword.passwordHash, password))) {
      // update password attempts
      await this.prismaService.userPassword.update({
        where: {
          id: userPassword.id,
        },
        data: {
          attempts: { increment: 1 },
          lastAttemptedAt: new Date(),
        },
      });

      throw LocaleException.unauthorized({
        message: "module.auth.emailOrPasswordIncorrectError",
        cause: "User password does not match",
      });
    }

    // reset password attempts
    if (userPassword.attempts) {
      await this.prismaService.userPassword.update({
        where: {
          id: userPassword.id,
        },
        data: {
          attempts: 0,
        },
      });
    }

    // return user
    return userPassword.user;
  }

  async updatePassword({
    userId,
    password,
    keepUserSessionId,
  }: {
    userId: string;
    password: string;
    keepUserSessionId?: string;
  }): Promise<void> {
    // validate password strength
    if (!PASSWORD_REGEX.test(password)) {
      throw LocaleException.badRequest({ message: "module.auth.invalidPasswordFormatError" });
    }

    // find user password
    const userPassword = await this.prismaService.userPassword.findUnique({
      where: {
        userId,
      },
    });

    // hash password
    const passwordHash = await createHash(password);

    await this.prismaService.$transaction(async (tx) => {
      if (!userPassword) {
        // create user password
        await tx.userPassword.create({
          data: {
            userId,
            passwordHash,
          },
        });
      } else {
        // update user password
        await tx.userPassword.update({
          where: {
            id: userPassword.id,
          },
          data: {
            passwordHash,
            lastChangedAt: new Date(),
          },
        });
      }

      // delete all user sessions except current session
      await tx.userSession.deleteMany({
        where: {
          userId,
          ...(keepUserSessionId && { id: { not: keepUserSessionId } }),
        },
      });
    });
  }

  async refresh(req: Pick<Request, "cookies">, res: Pick<Response, "cookie">, authRefreshDto: AuthRefreshDto) {
    // get session id and refresh token from body or cookies
    const cookies = req.cookies as AuthCookies;
    const sessionId = authRefreshDto.id ?? cookies.sessionId;
    const refreshToken = authRefreshDto.refreshToken ?? cookies.refreshToken;

    if (!sessionId || !refreshToken) {
      throw LocaleException.notFound();
    }

    try {
      // authenticate session
      const sessionCurrent = await this._findSessionBySessionIdAndRefreshToken(sessionId, refreshToken);

      // create refresh credentials
      const refreshCredentials = await this._generateRefreshCredentials();

      // update session
      const sessionUpdated = await this.prismaService.userSession.update({
        where: {
          id: sessionCurrent.id,
          refreshTokenHash: sessionCurrent.refreshTokenHash,
        },
        data: {
          refreshTokenHash: await createHash(refreshCredentials.refreshToken),
          refreshTokenExpiresAt: refreshCredentials.refreshTokenExpiresAt,
        },
      });

      // create access credentials
      const accessCredentials = await this._generateAccessCredentials(sessionUpdated.id);

      if (authRefreshDto.issue === "body") {
        // return credentials in response body
        return {
          ...accessCredentials,
          ...refreshCredentials,
          id: sessionUpdated.id,
        };
      } else {
        // return refresh credentials in response cookie
        this._setCookies(sessionUpdated.id, refreshCredentials, res);
        return {
          ...accessCredentials,
          id: sessionUpdated.id,
        };
      }
    } catch (error) {
      throw LocaleException.unauthorized({ cause: error });
    }
  }

  async logout({
    req,
    res,
    authLogoutDto,
  }: {
    req: Pick<Request, "cookies">;
    res: Pick<Response, "clearCookie">;
    authLogoutDto: AuthLogoutDto;
  }) {
    try {
      // get session id and refresh token from body or cookies
      const cookies = req.cookies as AuthCookies;
      const sessionId = authLogoutDto.id ?? cookies.sessionId;
      const refreshToken = authLogoutDto.refreshToken ?? cookies.refreshToken;

      if (!sessionId || !refreshToken) {
        throw LocaleException.notFound();
      }
      // authenticate session
      const sessionCurrent = await this._findSessionBySessionIdAndRefreshToken(sessionId, refreshToken);

      // delete user session
      await this.prismaService.userSession.delete({
        where: {
          id: sessionCurrent.id,
        },
      });

      // clear cookies in response
      this._clearCookies(res);
    } catch (error) {
      this.logger.error("Error logging out user", error);
    }
  }

  async _findSessionBySessionIdAndRefreshToken(sessionId: string, refreshToken: string) {
    const userSession = await this.prismaService.userSession.findUnique({
      where: {
        id: sessionId,
        refreshTokenExpiresAt: { gt: new Date() },
        user: {
          enabled: true,
          deleted: false,
        },
      },
      select: {
        id: true,
        userId: true,
        refreshTokenHash: true,
        refreshTokenExpiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!userSession) {
      throw LocaleException.notFound();
    }

    if (!(await verifyHash(userSession.refreshTokenHash, refreshToken))) {
      throw LocaleException.notFound();
    }

    return userSession;
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async _handleExpiredUserSessionDelete() {
    const logTag = "[_handleExpiredUserSessionDelete]";

    try {
      this.logger.log(logTag, "Starting task...");

      const now = new Date();

      // delete expired user sessions
      await this.prismaService.userSession.deleteMany({
        where: { refreshTokenExpiresAt: { lt: now } },
      });

      this.logger.log(logTag, "Completed task!");
    } catch (error) {
      this.logger.error(logTag, "Error handling task", error);
    }
  }
}
