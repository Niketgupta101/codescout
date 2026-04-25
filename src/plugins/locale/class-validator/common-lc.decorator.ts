// for original decorators
// see https://github.com/typestack/class-validator/tree/develop/src/decorator/common
import {
  Allow,
  Equals,
  IsDefined,
  IsEmpty,
  IsIn,
  IsNotEmpty,
  IsNotIn,
  IsOptional,
  NotEquals,
  ValidateIf,
  ValidateNested,
  ValidationOptions,
} from "class-validator";
import { LocaleValidationOptions, createLocaleValidationOptions } from "../nest/locale-validation-options";

export const AllowLc = (validationOptions?: ValidationOptions) => Allow(validationOptions);

export const EqualsLc = (comparison: unknown, validationOptions?: LocaleValidationOptions) =>
  Equals(
    comparison,
    createLocaleValidationOptions({
      constraints: [comparison],
      defaultMessage: "validation.equals",
      validationOptions,
    }),
  );

export const IsDefinedLc = (validationOptions?: LocaleValidationOptions) =>
  IsDefined(
    createLocaleValidationOptions({
      defaultMessage: "validation.isDefined",
      validationOptions,
    }),
  );

export const IsEmptyLc = (validationOptions?: LocaleValidationOptions) =>
  IsEmpty(
    createLocaleValidationOptions({
      defaultMessage: "validation.isEmpty",
      validationOptions,
    }),
  );

export const IsInLc = (possibleValues: unknown[], validationOptions?: LocaleValidationOptions) =>
  IsIn(
    possibleValues,
    createLocaleValidationOptions({
      constraints: [possibleValues],
      defaultMessage: "validation.isIn",
      validationOptions,
    }),
  );

export const IsNotEmptyLc = (validationOptions?: LocaleValidationOptions) =>
  IsNotEmpty(
    createLocaleValidationOptions({
      defaultMessage: "validation.isNotEmpty",
      validationOptions,
    }),
  );

export const IsNotInLc = (values: readonly unknown[], validationOptions?: LocaleValidationOptions) =>
  IsNotIn(
    values,
    createLocaleValidationOptions({
      constraints: [values],
      defaultMessage: "validation.isNotIn",
      validationOptions,
    }),
  );

export const IsOptionalLc = (validationOptions?: ValidationOptions) => IsOptional(validationOptions);

export const NotEqualsLc = (comparison: unknown, validationOptions?: LocaleValidationOptions) =>
  NotEquals(
    comparison,
    createLocaleValidationOptions({
      constraints: [comparison],
      defaultMessage: "validation.notEquals",
      validationOptions,
    }),
  );

export const ValidateIfLc = (
  condition: (object: Record<string, unknown>, value: unknown) => boolean,
  validationOptions?: ValidationOptions,
) => ValidateIf(condition, validationOptions);

export const ValidateNestedLc = (validationOptions?: LocaleValidationOptions) =>
  ValidateNested(
    createLocaleValidationOptions({
      defaultMessage: "validation.validateNested",
      validationOptions,
    }),
  );
