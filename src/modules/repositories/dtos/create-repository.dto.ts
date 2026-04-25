import { Prisma, RepositoryType } from "@prisma/client";
import { IsOptionalLc } from "src/plugins/locale/class-validator/common-lc.decorator";
import { IsUrlLc } from "src/plugins/locale/class-validator/string-lc.decorator";
import { IsEnumLc, IsStringLc } from "src/plugins/locale/class-validator/typechecker-lc.decorator";

export class CreateRepositoryDto {
  @IsUrlLc()
  url: string;

  @IsOptionalLc()
  @IsStringLc()
  branch?: string;

  @IsEnumLc(RepositoryType)
  type: RepositoryType;

  @IsOptionalLc()
  metadata?: Prisma.InputJsonValue;
}
