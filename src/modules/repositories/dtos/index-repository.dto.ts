import { RepositoryType } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsOptionalLc } from "src/plugins/locale/class-validator/common-lc.decorator";
import { IsEnumLc, IsStringLc, IsBooleanLc } from "src/plugins/locale/class-validator/typechecker-lc.decorator";
import { IsUrlLc } from "src/plugins/locale/class-validator/string-lc.decorator";
import { transformBooleanString } from "src/utils/class-transformer.util";

export class IndexRepositoryDto {
  @IsUrlLc()
  url: string;

  @IsOptionalLc()
  @IsStringLc()
  branch?: string;

  @IsOptionalLc()
  @IsEnumLc(RepositoryType)
  repositoryType?: RepositoryType;

  @Transform(transformBooleanString())
  @IsOptionalLc()
  @IsBooleanLc()
  includeTests?: boolean;

  @IsOptionalLc()
  @IsStringLc()
  authToken?: string;
}
