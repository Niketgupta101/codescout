import { IsOptionalLc } from "src/plugins/locale/class-validator/common-lc.decorator";
import { IsStringLc } from "src/plugins/locale/class-validator/typechecker-lc.decorator";

export class AgentToolListFileDto {
  @IsOptionalLc()
  @IsStringLc()
  pathPattern?: string;
}
