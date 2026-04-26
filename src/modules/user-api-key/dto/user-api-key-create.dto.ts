import { IsStringLc } from "src/plugins/locale/class-validator/typechecker-lc.decorator";

export class UserApiKeyCreateDto {
  @IsStringLc()
  name: string;
}
