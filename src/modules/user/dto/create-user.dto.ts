import { Transform } from "class-transformer";
import { IsOptionalLc } from "src/plugins/locale/class-validator/common-lc.decorator";
import { IsEmailLc } from "src/plugins/locale/class-validator/string-lc.decorator";
import { IsBooleanLc, IsStringLc } from "src/plugins/locale/class-validator/typechecker-lc.decorator";
import { transformBooleanString } from "src/utils/class-transformer.util";

export class CreateUserDto {
  @IsStringLc({ name: "common.label.firstName" })
  firstName: string;

  @IsStringLc({ name: "common.label.lastName" })
  lastName: string;

  @IsEmailLc({}, { name: "common.label.email" })
  email: string;

  @Transform(transformBooleanString())
  @IsOptionalLc()
  @IsBooleanLc({ name: "common.label.enabled" })
  enabled?: boolean;
}
