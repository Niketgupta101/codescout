import { ConsoleLogger } from "@nestjs/common";
import { errWithCause } from "pino-std-serializers";

/** Redacts sensitive information from logs */
export class AppLogger extends ConsoleLogger {
  readonly redactPatterns = [/cookie/i, /authorization/i, /password/i, /hash$/i];
  readonly redactValue = "[REDACTED]";

  _replacer = (key: string, value: unknown) => {
    // redact values for keys that match patterns
    return this.redactPatterns.some((regex) => regex.test(key))
      ? this.redactValue
      : // serialize errors with cause
        value instanceof Error
        ? errWithCause(value)
        : value;
  };

  _serialize(args: Parameters<ConsoleLogger["log"]>) {
    return args.map((arg: unknown) =>
      typeof arg === "object" && arg !== null ? JSON.stringify(arg, this._replacer, 2) : arg,
    ) as Parameters<ConsoleLogger["log"]>;
  }

  log(...args: Parameters<ConsoleLogger["log"]>) {
    super.log(...this._serialize(args));
  }

  error(...args: Parameters<ConsoleLogger["error"]>) {
    super.error(...this._serialize(args));
  }

  warn(...args: Parameters<ConsoleLogger["warn"]>) {
    super.warn(...this._serialize(args));
  }

  debug(...args: Parameters<ConsoleLogger["debug"]>) {
    super.debug(...this._serialize(args));
  }

  verbose(...args: Parameters<ConsoleLogger["verbose"]>) {
    super.verbose(...this._serialize(args));
  }

  fatal(...args: Parameters<ConsoleLogger["fatal"]>) {
    super.fatal(...this._serialize(args));
  }
}
