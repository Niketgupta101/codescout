// for original decorators
// see https://github.com/typestack/class-validator/tree/develop/src/decorator/typechecker
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsNumberOptions,
  IsObject,
  IsString,
} from "class-validator";
import { LocaleValidationOptions, createLocaleValidationOptions } from "../nest/locale-validation-options";

export const IsArrayLc = (validationOptions?: LocaleValidationOptions) =>
  IsArray(
    createLocaleValidationOptions({
      defaultMessage: "validation.isArray",
      validationOptions,
    }),
  );

export const IsBooleanLc = (validationOptions?: LocaleValidationOptions) =>
  IsBoolean(
    createLocaleValidationOptions({
      defaultMessage: "validation.isBoolean",
      validationOptions,
    }),
  );

export const IsDateLc = (validationOptions?: LocaleValidationOptions) =>
  IsDate(
    createLocaleValidationOptions({
      defaultMessage: "validation.isDate",
      validationOptions,
    }),
  );

export const IsEnumLc = (entity: Record<string, unknown>, validationOptions?: LocaleValidationOptions) =>
  IsEnum(
    entity,
    createLocaleValidationOptions({
      constraints: [
        entity,
        Object.entries(entity)
          .filter(([key]) => isNaN(parseInt(key)))
          .map(([, value]) => value),
      ],
      defaultMessage: "validation.isEnum",
      validationOptions,
    }),
  );

export const IsIntLc = (validationOptions?: LocaleValidationOptions) =>
  IsInt(
    createLocaleValidationOptions({
      defaultMessage: "validation.isInt",
      validationOptions,
    }),
  );

export const IsNumberLc = (options?: IsNumberOptions, validationOptions?: LocaleValidationOptions) =>
  IsNumber(
    options,
    createLocaleValidationOptions({
      constraints: [options],
      defaultMessage: "validation.isNumber",
      validationOptions,
    }),
  );

export const IsObjectLc = (validationOptions?: LocaleValidationOptions) =>
  IsObject(
    createLocaleValidationOptions({
      defaultMessage: "validation.isObject",
      validationOptions,
    }),
  );

export const IsStringLc = (validationOptions?: LocaleValidationOptions) =>
  IsString(
    createLocaleValidationOptions({
      defaultMessage: "validation.isString",
      validationOptions,
    }),
  );
