import { ProjectFolderProvider } from "@prisma/client";
import { IsOptionalLc } from "src/plugins/locale/class-validator/common-lc.decorator";
import { MinLc } from "src/plugins/locale/class-validator/number-lc.decorator";
import { IsEnumLc, IsIntLc } from "src/plugins/locale/class-validator/typechecker-lc.decorator";

export class FindAllProjectFoldersDto {
  @IsOptionalLc()
  @IsEnumLc(ProjectFolderProvider)
  provider?: ProjectFolderProvider;

  @IsOptionalLc()
  @IsIntLc()
  @MinLc(0)
  skip?: number;

  @IsOptionalLc()
  @IsIntLc()
  @MinLc(0)
  take?: number;
}
