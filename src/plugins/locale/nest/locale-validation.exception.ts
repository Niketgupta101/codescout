import { HttpException, HttpExceptionOptions, HttpStatus } from "@nestjs/common";
import { Locale, LocaleStringPath } from "../locale";
import { LocaleString } from "../locale-string";
import { ValidationError } from "class-validator";
import { LocaleException } from "./locale.exception";
import { LocaleValidationContext, isLocaleValidationContext } from "./locale-validation-options";

export type LocaleValidationError = {
  message: string;
  property: string;
  value?: unknown;
  constraint: string;
  context?: unknown;
};

export const localeValidationExceptionFactory = (errors: ValidationError[]) => {
  return new LocaleValidationException(localeValidationErrorFactory(errors));
};

export const localeValidationErrorFactory = (
  errors: ValidationError[],
  propertyPrefix = "",
): LocaleValidationError[] => {
  return errors.flatMap((error) => {
    const property = propertyPrefix + error.property;
    const localeErrors: LocaleValidationError[] = Object.entries(error.constraints ?? {}).map(
      ([constraint, message]) => {
        const value = error.value as unknown;
        const context = error.contexts?.[constraint] as unknown;
        return {
          message,
          property,
          value,
          constraint,
          context,
        };
      },
    );

    if (error.children?.length) {
      return localeErrors.concat(localeValidationErrorFactory(error.children, property + "."));
    } else {
      return localeErrors;
    }
  });
};

export const localeValidationMessageFactory = (error: LocaleValidationError, locale?: Locale) => {
  if (!isLocaleValidationContext(error.context)) {
    return error.message;
  }

  const name = error.context.localeNamePath && new LocaleString(error.context.localeNamePath);
  const eachPrefix = new LocaleString("validation.eachPrefix");

  let message = new LocaleString(error.context.localeMessagePath).toString(locale);
  message = message
    .replace(/\$eachPrefix\s?/g, error.context.each ? eachPrefix.toString(locale) + " " : "")
    .replace(/\$value/g, String(error.value))
    .replace(/\$property/g, name?.toString(locale) ?? error.property);

  if (error.context.constraints) {
    for (const [i, constraint] of error.context.constraints.entries()) {
      message = message = message.replace(
        new RegExp(`\\$constraint${i + 1}`, "g"),
        Array.isArray(constraint)
          ? constraint.join(", ")
          : typeof constraint === "symbol"
            ? (constraint.description ?? String(constraint))
            : String(constraint),
      );
    }
  }

  return message;
};

export class LocaleValidationException extends LocaleException {
  constructor(
    readonly validationErrors: LocaleValidationError[],
    readonly options?: HttpExceptionOptions,
  ) {
    super("error.badRequest", HttpStatus.BAD_REQUEST, options);
  }

  getHttpException(locale?: Locale) {
    return new HttpException(
      {
        message: this.localeMessage.toString(locale),
        validationErrors: this.validationErrors.map((error) => ({
          ...error,
          message: localeValidationMessageFactory(error, locale),
          context: undefined,
        })),
      },
      this.status,
      this.options,
    );
  }

  static from(
    errors: ({
      property: string;
      localeMessagePath: LocaleStringPath;
    } & Partial<LocaleValidationContext> &
      Partial<LocaleValidationError>)[],
  ) {
    return new this(
      errors.map(({ message, property, value, constraint, context, ...rest }) => ({
        property,
        message: message ?? "",
        constraint: constraint ?? "custom",
        context: {
          ...rest,
          ...(typeof context === "object" && context),
          localeNamePath: (context as LocaleValidationContext | undefined)?.localeNamePath ?? rest.localeNamePath,
          localeMessagePath:
            (context as LocaleValidationContext | undefined)?.localeMessagePath ?? rest.localeMessagePath,
        },
      })),
    );
  }
}
