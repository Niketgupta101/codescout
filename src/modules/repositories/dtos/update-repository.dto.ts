import { RepositoryType } from "@prisma/client";
import { IsOptionalLc } from "src/plugins/locale/class-validator/common-lc.decorator";
import { IsEnumLc, IsStringLc } from "src/plugins/locale/class-validator/typechecker-lc.decorator";

export class UpdateRepositoryDto {
  @IsOptionalLc()
  @IsStringLc()
  name?: string;

  @IsOptionalLc()
  @IsEnumLc(RepositoryType)
  repositoryType?: RepositoryType;
}
