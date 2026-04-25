import { Request } from "express";
import { Locale, localeConfig } from "../locale";

export type LocaleCookies = {
  locale?: string;
};

export const getLocaleFromRequest = (request: Partial<Pick<Request, "headers" | "cookies">>) =>
  ((request.headers as LocaleCookies | undefined)?.locale ??
    (request.cookies as LocaleCookies | undefined)?.locale ??
    localeConfig.defaultLocale) as Locale;
