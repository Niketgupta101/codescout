// for original decorators
// see decorator https://github.com/typestack/class-validator/tree/develop/src/decorator/object
import { IsInstance, IsNotEmptyObject } from "class-validator";
import { LocaleValidationOptions, createLocaleValidationOptions } from "../nest/locale-validation-options";

export const IsInstanceLc = (
  targetType: new (...args: unknown[]) => unknown,
  validationOptions?: LocaleValidationOptions,
) =>
  IsInstance(
    targetType,
    createLocaleValidationOptions({
      constraints: [targetType],
      defaultMessage: "validation.isInstance",
      validationOptions,
    }),
  );

export const IsNotEmptyObjectLc = (options?: { nullable?: boolean }, validationOptions?: LocaleValidationOptions) =>
  IsNotEmptyObject(
    options,
    createLocaleValidationOptions({
      constraints: [options],
      defaultMessage: "validation.isNotEmptyObject",
      validationOptions,
    }),
  );
