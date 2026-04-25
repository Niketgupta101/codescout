import { DeepIndex, deepIndex } from "./deep-index";
import { Locale, LocalePath, LocaleStrings, localeConfig } from "./locale";

export const getLocalePath = <TPath extends LocalePath>(
  path: TPath,
  locale: Locale,
): DeepIndex<LocaleStrings, TPath> => {
  return deepIndex(localeConfig.localeMap[locale], path) as DeepIndex<LocaleStrings, TPath>;
};
