import { IsEmail, IsIn, IsOptional, IsString } from "class-validator";
import { AuthIssue } from "../types/auth-issue.type";

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsIn(["body", "cookie"])
  issue?: AuthIssue = "cookie";
}
