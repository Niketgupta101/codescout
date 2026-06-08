import { Controller, Get, Res, Version, VERSION_NEUTRAL } from "@nestjs/common";
import { Public } from "../auth/decorators/public.decorator";
import { OAuthService } from "./oauth.service";
import { Response } from "express";
import { join } from "path";

@Controller()
export class OAuthController {
  readonly consentPagePath = join(process.cwd(), "dist", "assets", "oauth", "consent.html");
  readonly consentCsp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://esm.sh https://*.stytch.com https://*.stytch.dev",
    "style-src 'self' 'unsafe-inline' https://*.stytch.com https://*.stytch.dev",
    "connect-src 'self' https://esm.sh https://*.stytch.com https://*.stytch.dev",
    "img-src 'self' data: https:",
    "font-src 'self' data: https://*.stytch.com https://*.stytch.dev",
    "frame-src https://*.stytch.com https://*.stytch.dev",
    // the consent screen is a top-level auth page; forbid framing to prevent clickjacking the approve button
    "frame-ancestors 'none'",
  ].join("; ");

  constructor(readonly oauthService: OAuthService) {}

  @Public()
  @Version(VERSION_NEUTRAL)
  @Get(".well-known/oauth-protected-resource")
  protectedResourceMetadata(@Res() res: Response): void {
    res.json(this.oauthService.protectedResourceMetadataGet());
  }

  @Public()
  @Version(VERSION_NEUTRAL)
  @Get("oauth/consent")
  consentPage(@Res() res: Response): void {
    res.setHeader("Content-Security-Policy", this.consentCsp);
    // legacy fallback for browsers that ignore frame-ancestors
    res.setHeader("X-Frame-Options", "DENY");
    res.sendFile(this.consentPagePath);
  }

  @Public()
  @Version(VERSION_NEUTRAL)
  @Get("oauth/config")
  consentConfig(@Res() res: Response): void {
    res.json(this.oauthService.consentConfigGet());
  }
}
