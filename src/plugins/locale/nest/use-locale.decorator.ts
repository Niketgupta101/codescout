import { ArgumentsHost, createParamDecorator } from "@nestjs/common";
import { Request } from "express";
import { getLocaleFromRequest } from "./locale-request";

export const localeParamFactory = (data: unknown, host: ArgumentsHost) => {
  const request = host.switchToHttp().getRequest<Request>();
  return getLocaleFromRequest(request);
};

export const UseLocale = createParamDecorator(localeParamFactory);
