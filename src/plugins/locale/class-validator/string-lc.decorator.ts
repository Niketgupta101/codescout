// for original decorators
// see decorator https://github.com/typestack/class-validator/tree/develop/src/decorator/string
import {
  Contains,
  IsEmail,
  IsAlpha,
  IsAlphanumeric,
  IsBooleanString,
  IsDataURI,
  IsDateString,
  IsFQDN,
  IsLowercase,
  IsNumberString,
  IsUppercase,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  MinLength,
  IsUUID,
  NotContains,
  IsBase64,
  IsPhoneNumber,
} from "class-validator";
import {
  AlphaLocale,
  AlphanumericLocale,
  IsEmailOptions,
  IsFQDNOptions,
  IsISO8601Options,
  IsNumericOptions,
  IsURLOptions,
  UUIDVersion,
} from "validator";
import { LocaleValidationOptions, createLocaleValidationOptions } from "../nest/locale-validation-options";
import { CountryCode } from "libphonenumber-js";

export const IsEmailLc = (options?: IsEmailOptions, validationOptions?: LocaleValidationOptions) =>
  IsEmail(
    options,
    createLocaleValidationOptions({
      constraints: [options],
      defaultMessage: "validation.isEmail",
      validationOptions,
    }),
  );

export const ContainsLc = (seed: string, validationOptions?: LocaleValidationOptions) =>
  Contains(
    seed,
    createLocaleValidationOptions({
      constraints: [seed],
      defaultMessage: "validation.contains",
      validationOptions,
    }),
  );

export const IsAlphaLc = (locale?: AlphaLocale, validationOptions?: LocaleValidationOptions) =>
  IsAlpha(
    locale,
    createLocaleValidationOptions({
      constraints: [locale],
      defaultMessage: "validation.isAlpha",
      validationOptions,
    }),
  );

export const IsAlphanumericLc = (locale?: AlphanumericLocale, validationOptions?: LocaleValidationOptions) =>
  IsAlphanumeric(
    locale,
    createLocaleValidationOptions({
      constraints: [locale],
      defaultMessage: "validation.isAlphanumeric",
      validationOptions,
    }),
  );

export const IsBase64Lc = (options?: validator.IsBase64Options, validationOptions?: LocaleValidationOptions) =>
  IsBase64(
    options,
    createLocaleValidationOptions({
      defaultMessage: "validation.isBase64",
      validationOptions,
    }),
  );

export const IsBooleanStringLc = (validationOptions?: LocaleValidationOptions) =>
  IsBooleanString(
    createLocaleValidationOptions({
      defaultMessage: "validation.isBooleanString",
      validationOptions,
    }),
  );

export const IsDataURILc = (validationOptions?: LocaleValidationOptions) =>
  IsDataURI(
    createLocaleValidationOptions({
      defaultMessage: "validation.isDataURI",
      validationOptions,
    }),
  );

export const IsDateStringLc = (options?: IsISO8601Options, validationOptions?: LocaleValidationOptions) =>
  IsDateString(
    options,
    createLocaleValidationOptions({
      defaultMessage: "validation.isDateString",
      validationOptions,
    }),
  );

export const IsFQDNLc = (options?: IsFQDNOptions, validationOptions?: LocaleValidationOptions) =>
  IsFQDN(
    options,
    createLocaleValidationOptions({
      constraints: [options],
      defaultMessage: "validation.isFQDN",
      validationOptions,
    }),
  );

export const IsLowercaseLc = (validationOptions?: LocaleValidationOptions) =>
  IsLowercase(
    createLocaleValidationOptions({
      defaultMessage: "validation.isLowercase",
      validationOptions,
    }),
  );

export const IsNumberStringLc = (options?: IsNumericOptions, validationOptions?: LocaleValidationOptions) =>
  IsNumberString(
    options,
    createLocaleValidationOptions({
      constraints: [options],
      defaultMessage: "validation.isNumberString",
      validationOptions,
    }),
  );

export const IsPhoneNumberLc = (region?: CountryCode, validationOptions?: LocaleValidationOptions) =>
  IsPhoneNumber(
    region,
    createLocaleValidationOptions({
      defaultMessage: "validation.isPhoneNumber",
      validationOptions,
    }),
  );

export const IsUUIDLc = (version?: UUIDVersion, validationOptions?: LocaleValidationOptions) =>
  IsUUID(
    version,
    createLocaleValidationOptions({
      constraints: [version],
      defaultMessage: "validation.isUUID",
      validationOptions,
    }),
  );

export const IsUppercaseLc = (validationOptions?: LocaleValidationOptions) =>
  IsUppercase(
    createLocaleValidationOptions({
      defaultMessage: "validation.isUppercase",
      validationOptions,
    }),
  );

export const IsUrlLc = (options?: IsURLOptions, validationOptions?: LocaleValidationOptions) =>
  IsUrl(
    options,
    createLocaleValidationOptions({
      constraints: [options],
      defaultMessage: "validation.isUrl",
      validationOptions,
    }),
  );

export const LengthLc = (min: number, max?: number, validationOptions?: LocaleValidationOptions) =>
  Length(
    min,
    max,
    createLocaleValidationOptions({
      constraints: [min, max],
      defaultMessage: "validation.length",
      validationOptions,
    }),
  );

export type MatchesLcDecorator = {
  (pattern: RegExp, validationOptions?: LocaleValidationOptions): PropertyDecorator;
  (pattern: string, modifiers?: string, validationOptions?: LocaleValidationOptions): PropertyDecorator;
};

export const MatchesLc: MatchesLcDecorator = (
  pattern: RegExp | string,
  modifiersOrValidationOptions?: string | LocaleValidationOptions,
  validationOptions?: LocaleValidationOptions,
) =>
  typeof pattern === "string"
    ? Matches(
        pattern,
        modifiersOrValidationOptions as string,
        createLocaleValidationOptions({
          constraints: [pattern, modifiersOrValidationOptions],
          defaultMessage: "validation.matches",
          validationOptions,
        }),
      )
    : Matches(
        pattern,
        createLocaleValidationOptions({
          constraints: [pattern],
          defaultMessage: "validation.matches",
          validationOptions: modifiersOrValidationOptions as LocaleValidationOptions,
        }),
      );

export const MaxLengthLc = (max: number, validationOptions?: LocaleValidationOptions) =>
  MaxLength(
    max,
    createLocaleValidationOptions({
      constraints: [max],
      defaultMessage: "validation.maxLength",
      validationOptions,
    }),
  );

export const MinLengthLc = (min: number, validationOptions?: LocaleValidationOptions) =>
  MinLength(
    min,
    createLocaleValidationOptions({
      constraints: [min],
      defaultMessage: "validation.minLength",
      validationOptions,
    }),
  );

export const NotContainsLc = (seed: string, validationOptions?: LocaleValidationOptions) =>
  NotContains(
    seed,
    createLocaleValidationOptions({
      constraints: [seed],
      defaultMessage: "validation.notContains",
      validationOptions,
    }),
  );
