import { Injectable, Logger } from "@nestjs/common";

const GOOGLE_PING_URL = "https://www.google.com";
const GOOGLE_PING_TIMEOUT_MS = 3_000;

@Injectable()
export class HealthService {
  readonly logger = new Logger(HealthService.name);

  // confirms outbound HTTPS works at all - proxies "can the app reach openai/anthropic/github" without exercising those quota-limited APIs
  // returns false on any failure (timeout, DNS, non-2xx) so the health endpoint can report "degraded"
  async pingGoogle(): Promise<boolean> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), GOOGLE_PING_TIMEOUT_MS);

    try {
      const response = await fetch(GOOGLE_PING_URL, {
        method: "HEAD",
        signal: abortController.signal,
      });

      return response.ok;
    } catch (error) {
      // log at debug because health endpoint is hit frequently by render's probe; a transient failure shouldn't pollute warn-level logs
      this.logger.debug(`Google ping failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
}
