import { Injectable } from "@nestjs/common";
import { EnvService } from "../env/env.service";
import { LocaleException } from "src/plugins/locale/nest/locale.exception";
import { OAuthProtectedResourceMetadata } from "./types/protected-resource-metadata.type";
import { OAuthConsentConfig } from "./types/oauth-consent-config.type";

@Injectable()
export class OAuthService {
  constructor(readonly envService: EnvService) {}

  protectedResourceMetadataGet(): OAuthProtectedResourceMetadata {
    const appPublicUrl = this.envService.get("APP_PUBLIC_URL");
    const stytchDomain = this.envService.get("STYTCH_DOMAIN");

    if (!appPublicUrl || !stytchDomain) {
      throw LocaleException.notFound({ message: "module.oauth.notConfiguredError" });
    }

    return {
      resource: `${appPublicUrl}/v1/mcp`,
      authorization_servers: [stytchDomain],
      scopes_supported: ["openid", "email", "profile"],
      bearer_methods_supported: ["header"],
    };
  }

  consentConfigGet(): OAuthConsentConfig {
    const publicToken = this.envService.get("STYTCH_PUBLIC_TOKEN");

    if (!publicToken) {
      throw LocaleException.notFound({ message: "module.oauth.notConfiguredError" });
    }

    return { publicToken };
  }
}
