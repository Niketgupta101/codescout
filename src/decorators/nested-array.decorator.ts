import { applyDecorators } from "@nestjs/common";
import { ApiProperty, ApiPropertyOptions } from "@nestjs/swagger";
import { Type, TypeHelpOptions } from "class-transformer";
import { ValidateNestedLc } from "src/plugins/locale/class-validator/common-lc.decorator";
import { IsArrayLc } from "src/plugins/locale/class-validator/typechecker-lc.decorator";
import { LocaleValidationOptions } from "src/plugins/locale/nest/locale-validation-options";

/**
 * decorator combines:
 * @IsArrayLc()
 * @ValidateNestedLc({ each: true })
 * @Type(() => MyEntity)
 * @ApiProperty({ type: [MyEntity] })
 */
export const NestedArray = (
  typeFunction?: (type?: TypeHelpOptions) => new (...args: unknown[]) => unknown,
  validationOptions?: LocaleValidationOptions,
  apiPropertyOptions?: ApiPropertyOptions,
) =>
  applyDecorators(
    IsArrayLc(validationOptions),
    ValidateNestedLc({ ...validationOptions, each: true }),
    Type(typeFunction),
    ApiProperty(Object.assign({ type: [typeFunction?.()] }, apiPropertyOptions)),
  );
