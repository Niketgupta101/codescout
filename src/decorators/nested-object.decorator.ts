import { applyDecorators, Type as NestType } from "@nestjs/common";
import { ApiProperty, ApiPropertyOptions } from "@nestjs/swagger";
import { Type, TypeHelpOptions } from "class-transformer";
import { ValidateNestedLc } from "src/plugins/locale/class-validator/common-lc.decorator";
import { IsObjectLc } from "src/plugins/locale/class-validator/typechecker-lc.decorator";
import { LocaleValidationOptions } from "src/plugins/locale/nest/locale-validation-options";

/**
 * decorator combines:
 * @IsObjectLc()
 * @ValidateNestedLc()
 * @Type(() => MyEntity)
 * @ApiProperty({ type: MyEntity })
 */
export const NestedObject = (
  typeFunction?: (type?: TypeHelpOptions) => NestType<unknown>,
  validationOptions?: LocaleValidationOptions,
  apiPropertyOptions?: ApiPropertyOptions,
) =>
  applyDecorators(
    IsObjectLc(validationOptions),
    ValidateNestedLc(validationOptions),
    Type(typeFunction),
    ApiProperty(Object.assign({ type: typeFunction?.() }, apiPropertyOptions)),
  );
