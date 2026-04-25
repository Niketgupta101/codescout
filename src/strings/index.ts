import "dotenv/config";
import { Locale } from "src/plugins/locale/locale";
import { commonStringsEn } from "./en/common.strings";
import { errorStringsEn } from "./en/error.strings";
import { validationStringsEn } from "./en/validation.strings";
import { moduleStringsEn } from "./en/module.strings";

// automatically imported by src/plugins/locale
export const defaultLocale = process.env.LOCALE as Locale;
export const localeMap = {
  en: {
    common: commonStringsEn,
    error: errorStringsEn,
    validation: validationStringsEn,
    module: moduleStringsEn,
  },
};
