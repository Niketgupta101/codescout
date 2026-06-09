import { Injectable, Logger } from "@nestjs/common";
import { Client as StytchClient } from "stytch";
import { EnvService } from "../env/env.service";
import { StytchUserIdentity } from "./types/stytch-user-identity.type";

@Injectable()
export class StytchService {
  readonly logger = new Logger(StytchService.name);
  readonly client: StytchClient | null;

  constructor(readonly envService: EnvService) {
    const projectId = this.envService.get("STYTCH_PROJECT_ID");
    const secret = this.envService.get("STYTCH_SECRET");
    const customBaseUrl = this.envService.get("STYTCH_DOMAIN");

    // stytch stays unconfigured on deployments that don't use oauth
    this.client =
      projectId && secret ? new StytchClient({ project_id: projectId, secret, custom_base_url: customBaseUrl }) : null;
  }

  _requireClient(): StytchClient {
    if (!this.client) {
      throw new Error("Stytch is not configured (set STYTCH_PROJECT_ID and STYTCH_SECRET)");
    }

    return this.client;
  }

  async verifyTokenAndGetIdentity(accessToken: string): Promise<StytchUserIdentity> {
    const client = this._requireClient();

    const claims = await client.idp.introspectTokenLocal(accessToken).catch((error: unknown) => {
      this.logger.warn("Stytch token introspection failed", error);
      return null;
    });

    if (!claims) {
      throw new Error("Invalid or expired Stytch access token");
    }

    // stytch's idp issues connected-apps access tokens with aud = the stytch project id (not an rfc 8707 resource url)
    // the jwks signature check above already binds the token to our project; this asserts the claim matches too
    const expectedAudience = this.envService.get("STYTCH_PROJECT_ID");
    const audiences = Array.isArray(claims.audience) ? claims.audience : [claims.audience];

    if (!expectedAudience || !audiences.includes(expectedAudience)) {
      throw new Error(`Token audience [${audiences.join(", ")}] does not match project ${expectedAudience}`);
    }

    const user = await client.users.get({ user_id: claims.subject });

    // only trust a verified email - an unverified one an attacker added to their stytch account must never match a db user
    const verifiedEmail = user.emails.find((email) => email.verified)?.email;

    if (!verifiedEmail) {
      throw new Error("Stytch user has no verified email address");
    }

    return {
      subject: claims.subject,
      email: verifiedEmail,
      firstName: user.name?.first_name,
      lastName: user.name?.last_name,
    };
  }
}
