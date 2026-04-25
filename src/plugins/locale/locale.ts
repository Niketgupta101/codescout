import { defaultLocale, localeMap } from "src/strings";
import { DeepIndex, DeepIndexPath } from "./deep-index";

/** Map of locale to locale strings */
export type LocaleMap = typeof localeMap;

/** Locales */
export type Locale<TLocale = keyof LocaleMap> = TLocale;

/** Locale strings for a single locale */
export type LocaleStrings<TStrings = LocaleMap[Locale]> = TStrings;

/** All root to node paths in locale strings  */
export type LocalePath<TStrings = LocaleStrings> = DeepIndexPath<TStrings>;

/** All root to leaf paths ending in strings in locale strings  */
export type LocaleStringPath<TStrings = LocaleStrings> = {
  [P in LocalePath<TStrings>]: DeepIndex<LocaleStrings<TStrings>, P> extends string ? P : never;
}[LocalePath<TStrings>];

/** Locale configuration */
export const localeConfig = {
  defaultLocale,
  localeMap,
};
