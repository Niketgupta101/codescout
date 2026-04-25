// for original decorators
// see https://github.com/typestack/class-validator/tree/develop/src/decorator/date
import { MaxDate, MinDate } from "class-validator";
import { LocaleValidationOptions, createLocaleValidationOptions } from "../nest/locale-validation-options";

export const MaxDateLc = (maxDate: Date, validationOptions?: LocaleValidationOptions) =>
  MaxDate(
    maxDate,
    createLocaleValidationOptions({
      constraints: [maxDate],
      defaultMessage: "validation.maxDate",
      validationOptions,
    }),
  );

export const MinDateLc = (minDate: Date, validationOptions?: LocaleValidationOptions) =>
  MinDate(
    minDate,
    createLocaleValidationOptions({
      constraints: [minDate],
      defaultMessage: "validation.minDate",
      validationOptions,
    }),
  );
