import { Transform } from "class-transformer";
import { IsInLc, IsOptionalLc } from "src/plugins/locale/class-validator/common-lc.decorator";
import { MinLc } from "src/plugins/locale/class-validator/number-lc.decorator";
import { IsBooleanLc, IsIntLc, IsStringLc } from "src/plugins/locale/class-validator/typechecker-lc.decorator";
import { transformBooleanString, transformTrim } from "src/utils/class-transformer.util";

export class FindAllUsersDto {
  @Transform(transformBooleanString())
  @IsOptionalLc()
  @IsBooleanLc()
  enabled?: boolean;

  @Transform(transformTrim())
  @IsOptionalLc()
  @IsStringLc()
  contains?: string;

  @IsOptionalLc()
  @IsInLc(["createdAt", "updatedAt", "name", "role", "status", "email", "language"])
  orderBy?: "createdAt" | "updatedAt" | "name" | "role" | "email" | "language";

  @IsOptionalLc()
  @IsInLc(["asc", "desc"])
  orderDirection?: "asc" | "desc";

  @IsOptionalLc()
  @IsIntLc()
  @MinLc(0)
  skip?: number;

  @IsOptionalLc()
  @IsIntLc()
  @MinLc(0)
  take?: number;
}
