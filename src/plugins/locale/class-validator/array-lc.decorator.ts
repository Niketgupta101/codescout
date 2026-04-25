// for original decorators
// see https://github.com/typestack/class-validator/tree/develop/src/decorator/array
import {
  ArrayContains,
  ArrayMaxSize,
  ArrayMinSize,
  ArrayNotContains,
  ArrayNotEmpty,
  ArrayUnique,
  ArrayUniqueIdentifier,
} from "class-validator";
import { LocaleValidationOptions, createLocaleValidationOptions } from "../nest/locale-validation-options";

export const ArrayContainsLc = (values: unknown[], validationOptions?: LocaleValidationOptions) =>
  ArrayContains(
    values,
    createLocaleValidationOptions({
      constraints: [values],
      defaultMessage: "validation.arrayContains",
      validationOptions,
    }),
  );

export const ArrayMaxSizeLc = (max: number, validationOptions?: LocaleValidationOptions) =>
  ArrayMaxSize(
    max,
    createLocaleValidationOptions({
      constraints: [max],
      defaultMessage: "validation.arrayMaxSize",
      validationOptions,
    }),
  );

export const ArrayMinSizeLc = (min: number, validationOptions?: LocaleValidationOptions) =>
  ArrayMinSize(
    min,
    createLocaleValidationOptions({
      constraints: [min],
      defaultMessage: "validation.arrayMinSize",
      validationOptions,
    }),
  );

export const ArrayNotContainsLc = (values: unknown[], validationOptions?: LocaleValidationOptions) =>
  ArrayNotContains(
    values,
    createLocaleValidationOptions({
      constraints: [values],
      defaultMessage: "validation.arrayNotContains",
      validationOptions,
    }),
  );

export const ArrayNotEmptyLc = (validationOptions?: LocaleValidationOptions) =>
  ArrayNotEmpty(
    createLocaleValidationOptions({
      defaultMessage: "validation.arrayNotEmpty",
      validationOptions,
    }),
  );

export const ArrayUniqueLc = <T>(
  identifierOrOptions?: ArrayUniqueIdentifier<T> | LocaleValidationOptions,
  validationOptions?: LocaleValidationOptions,
) =>
  typeof identifierOrOptions === "function"
    ? ArrayUnique(
        identifierOrOptions,
        createLocaleValidationOptions({
          defaultMessage: "validation.arrayUnique",
          validationOptions,
        }),
      )
    : ArrayUnique(
        createLocaleValidationOptions({
          defaultMessage: "validation.arrayUnique",
          validationOptions: identifierOrOptions,
        }),
      );
