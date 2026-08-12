import { RepositoryFileLanguage } from "@prisma/client";
import { IsOptionalLc } from "src/plugins/locale/class-validator/common-lc.decorator";
import { IsEnumLc, IsStringLc } from "src/plugins/locale/class-validator/typechecker-lc.decorator";

export class AgentToolSearchCodeDto {
  @IsStringLc()
  pattern: string;

  @IsOptionalLc()
  @IsEnumLc(RepositoryFileLanguage)
  language?: RepositoryFileLanguage;

  @IsOptionalLc()
  @IsStringLc()
  pathPattern?: string;
}
