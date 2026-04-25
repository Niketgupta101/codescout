import { HttpException, HttpExceptionOptions, HttpStatus } from "@nestjs/common";
import { Locale, LocaleStringPath } from "../locale";
import { LocaleString } from "../locale-string";

export type LocaleExceptionFactoryOptions = HttpExceptionOptions & {
  message?: LocaleString | LocaleStringPath;
};

export class LocaleException extends Error {
  readonly localeMessage: LocaleString;

  constructor(
    localeResponse: LocaleString | LocaleStringPath,
    readonly status: number,
    readonly options?: HttpExceptionOptions,
  ) {
    const localeMessage = localeResponse instanceof LocaleString ? localeResponse : new LocaleString(localeResponse);

    const messageEn = localeMessage.toString("en");
    super(messageEn, { cause: options?.cause });
    this.localeMessage = localeMessage;
  }

  getHttpException(locale?: Locale) {
    return new HttpException(this.localeMessage.toString(locale), this.status, this.options);
  }

  static badRequest(options?: LocaleExceptionFactoryOptions) {
    return new this(options?.message ?? "error.badRequest", HttpStatus.BAD_REQUEST, options);
  }

  static conflict(options?: LocaleExceptionFactoryOptions) {
    return new this(options?.message ?? "error.conflict", HttpStatus.CONFLICT, options);
  }

  static forbidden(options?: LocaleExceptionFactoryOptions) {
    return new this(options?.message ?? "error.forbidden", HttpStatus.FORBIDDEN, options);
  }

  static internalServerError(options?: LocaleExceptionFactoryOptions) {
    return new this(options?.message ?? "error.internalServerError", HttpStatus.INTERNAL_SERVER_ERROR, options);
  }

  static notFound(options?: LocaleExceptionFactoryOptions) {
    return new this(options?.message ?? "error.notFound", HttpStatus.NOT_FOUND, options);
  }

  static serviceUnavailable(options?: LocaleExceptionFactoryOptions) {
    return new this(options?.message ?? "error.serviceUnavailable", HttpStatus.SERVICE_UNAVAILABLE, options);
  }

  static unauthorized(options?: LocaleExceptionFactoryOptions) {
    return new this(options?.message ?? "error.unauthorized", HttpStatus.UNAUTHORIZED, options);
  }
}
