import { ValidationOptions } from "class-validator";
import { LocaleStringPath } from "src/plugins/locale/locale";

export type LocaleValidationOptions = Omit<ValidationOptions, "message"> & {
  name?: LocaleStringPath;
  message?: LocaleStringPath;
};

export type LocaleValidationContext = {
  each?: boolean;
  constraints?: unknown[];
  localeNamePath?: LocaleStringPath;
  localeMessagePath: LocaleStringPath;
};

export const isLocaleValidationContext = (context: unknown): context is LocaleValidationContext => {
  return typeof context === "object" && context !== null && "localeMessagePath" in context;
};

export const createLocaleValidationOptions = ({
  constraints,
  defaultMessage,
  validationOptions: { name, message, ...validationOptions } = {},
}: {
  constraints?: unknown[];
  defaultMessage: LocaleStringPath;
  validationOptions?: LocaleValidationOptions;
}): ValidationOptions => ({
  ...validationOptions,
  context: {
    each: validationOptions?.each,
    constraints,
    localeNamePath: name,
    localeMessagePath: message ?? defaultMessage,
  } as LocaleValidationContext,
});
