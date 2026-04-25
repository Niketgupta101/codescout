import { NoInferType } from "@nestjs/config";
import { Locale, LocaleStringPath, LocaleStrings, localeConfig } from "./locale";
import { deepIndex } from "./deep-index";

/**
 * Creates a string that can be localized at a later time.
 * Useful when request context or locale context not available.
 **/
export class LocaleString<TStrings = LocaleStrings> {
  constructor(
    readonly path: NoInferType<LocaleStringPath<TStrings>>,
    readonly params?: Record<string, unknown>,
  ) {}

  toString(locale?: Locale): string {
    // lookup string
    let string = deepIndex(localeConfig.localeMap[locale ?? localeConfig.defaultLocale], this.path as LocaleStringPath);

    // format string
    if (this.params) {
      for (const [name, value] of Object.entries(this.params)) {
        string = string.replace(
          new RegExp("{{\\s{0,}" + name + "\\s{0,}}}", "g"),
          value instanceof LocaleString ? value.toString(locale) : String(value),
        );
      }
    }

    return string;
  }

  toJSON() {
    return this.toString();
  }
}
