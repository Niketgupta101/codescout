import { ArgumentsHost, HttpException } from "@nestjs/common";
import { LocaleException } from "./locale.exception";
import { HttpExceptionFactory } from "src/providers/app-exception.filter";
import { Request } from "express";
import { getLocaleFromRequest } from "./locale-request";

export class LocaleHttpExceptionFactory implements HttpExceptionFactory {
  createHttpException(exception: unknown, host: ArgumentsHost): HttpException {
    let request;
    switch (host.getType()) {
      case "http":
        request = host.switchToHttp().getRequest<Request>();
        break;
      case "ws":
        request = host.switchToWs().getClient<{ handshake: Partial<Request> }>().handshake;
        break;
    }

    let locale;
    if (request) {
      locale = getLocaleFromRequest(request);
    }

    return exception instanceof LocaleException
      ? exception.getHttpException(locale)
      : exception instanceof HttpException
        ? exception
        : LocaleException.internalServerError({ cause: exception }).getHttpException(locale);
  }
}
