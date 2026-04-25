import { IsOptional, IsString } from "class-validator";

export class AuthLogoutDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  refreshToken?: string;
}
