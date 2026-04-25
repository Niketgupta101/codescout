import { registerDecorator, ValidationOptions, ValidationArguments } from "class-validator";
import ms from "ms";

export const IsMsStringValue = (validationOptions?: ValidationOptions) =>
  function (object: object, propertyName: string) {
    registerDecorator({
      name: "isMsStringValue",
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== "string") {
            return false;
          }
          try {
            ms(value as ms.StringValue);
            return true;
          } catch {
            return false;
          }
        },
        defaultMessage(args: ValidationArguments) {
          return `"${String(args.value)}" is not a valid ms duration string (e.g., "1d", "10m", "2h")`;
        },
      },
    });
  };
