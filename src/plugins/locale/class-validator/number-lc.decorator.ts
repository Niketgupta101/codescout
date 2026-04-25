// for original decorators
// see decorator https://github.com/typestack/class-validator/tree/develop/src/decorator/number
import { IsDivisibleBy, IsNegative, IsPositive, Max, Min } from "class-validator";
import { LocaleValidationOptions, createLocaleValidationOptions } from "../nest/locale-validation-options";

export const isDivisibleByLc = (num: number, validationOptions?: LocaleValidationOptions) =>
  IsDivisibleBy(
    num,
    createLocaleValidationOptions({
      constraints: [num],
      defaultMessage: "validation.isDivisibleBy",
      validationOptions,
    }),
  );

export const IsNegativeLc = (validationOptions?: LocaleValidationOptions) =>
  IsNegative(
    createLocaleValidationOptions({
      defaultMessage: "validation.isNegative",
      validationOptions,
    }),
  );

export const IsPositiveLc = (validationOptions?: LocaleValidationOptions) =>
  IsPositive(
    createLocaleValidationOptions({
      defaultMessage: "validation.isPositive",
      validationOptions,
    }),
  );

export const MaxLc = (maxValue: number, validationOptions?: LocaleValidationOptions) =>
  Max(
    maxValue,
    createLocaleValidationOptions({
      constraints: [maxValue],
      defaultMessage: "validation.max",
      validationOptions,
    }),
  );

export const MinLc = (minValue: number, validationOptions?: LocaleValidationOptions) =>
  Min(
    minValue,
    createLocaleValidationOptions({
      constraints: [minValue],
      defaultMessage: "validation.min",
      validationOptions,
    }),
  );
