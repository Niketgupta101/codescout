import { Transform } from "class-transformer";
import { IsOptionalLc } from "src/plugins/locale/class-validator/common-lc.decorator";
import { IsBooleanLc, IsStringLc } from "src/plugins/locale/class-validator/typechecker-lc.decorator";
import { IsUrlLc } from "src/plugins/locale/class-validator/string-lc.decorator";
import { transformBooleanString } from "src/utils/class-transformer.util";

export class IndexRepositoryCostEstimateDto {
  @IsUrlLc()
  url: string;

  @IsOptionalLc()
  @IsStringLc()
  branch?: string;

  @Transform(transformBooleanString())
  @IsOptionalLc()
  @IsBooleanLc()
  includeTests?: boolean;

  @IsOptionalLc()
  @IsStringLc()
  authToken?: string;
}
