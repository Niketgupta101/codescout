import { IsOptionalLc } from "src/plugins/locale/class-validator/common-lc.decorator";
import { IsStringLc } from "src/plugins/locale/class-validator/typechecker-lc.decorator";

export class UpdateMeDto {
  @IsOptionalLc()
  @IsStringLc({ name: "common.label.firstName" })
  firstName?: string;

  @IsOptionalLc()
  @IsStringLc({ name: "common.label.lastName" })
  lastName?: string;

  @IsOptionalLc()
  @IsStringLc({ name: "module.me.oldPasswordLabel" })
  oldPassword?: string;

  @IsOptionalLc()
  @IsStringLc({ name: "module.me.newPasswordLabel" })
  newPassword?: string;
}
