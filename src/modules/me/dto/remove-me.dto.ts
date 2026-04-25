import { IsStringLc } from "src/plugins/locale/class-validator/typechecker-lc.decorator";

export class RemoveMeDto {
  @IsStringLc({ name: "common.label.password" })
  password: string;
}
