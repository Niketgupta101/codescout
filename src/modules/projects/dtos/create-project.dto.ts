import { IsOptionalLc } from "src/plugins/locale/class-validator/common-lc.decorator";
import { IsStringLc } from "src/plugins/locale/class-validator/typechecker-lc.decorator";

export class CreateProjectDto {
  @IsStringLc()
  name: string;

  @IsOptionalLc()
  @IsStringLc()
  description?: string;
}
