import { IsIn, IsOptional, IsString } from "class-validator";
import { AuthIssue } from "../types/auth-issue.type";

export class AuthRefreshDto {
  @IsOptional()
  @IsIn(["body", "cookie"])
  issue?: AuthIssue;

  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  refreshToken?: string;
}
