import { Transform } from "class-transformer";
import { IsOptionalLc } from "src/plugins/locale/class-validator/common-lc.decorator";
import { IsBooleanLc } from "src/plugins/locale/class-validator/typechecker-lc.decorator";
import { transformBooleanString } from "src/utils/class-transformer.util";

export class ImportProjectFolderDto {
  // re-import every file, bypassing the unchanged-since-last-import skip
  @Transform(transformBooleanString())
  @IsOptionalLc()
  @IsBooleanLc()
  force?: boolean;
}
