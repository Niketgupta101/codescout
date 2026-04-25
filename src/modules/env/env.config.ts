import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, MinLength } from "class-validator";
import ms from "ms";
import { IsMsStringValue } from "src/decorators/is-ms-string-value.decorator";
import { transformBooleanString } from "src/utils/class-transformer.util";

export class EnvConfig {
  @IsIn(["en"])
  LOCALE: "en";

  @Transform(transformBooleanString())
  @IsOptional()
  @IsBoolean()
  PRETTY_PRINT_ERRORS?: boolean;

  @Transform(transformBooleanString())
  @IsOptional()
  @IsBoolean()
  OPENAPI_ENABLED?: boolean;

  @IsOptional()
  @IsString()
  OPENAPI_USERNAME?: string;

  @IsOptional()
  @IsString()
  OPENAPI_PASSWORD?: string;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  @MinLength(10)
  ACCESS_TOKEN_SECRET_BASE64: string;

  @IsMsStringValue()
  ACCESS_TOKEN_EXPIRES_IN: ms.StringValue;

  @IsMsStringValue()
  REFRESH_TOKEN_EXPIRES_IN: ms.StringValue;

  @Transform(transformBooleanString())
  @IsOptional()
  @IsBoolean()
  SECURE_COOKIES?: boolean;

  @IsNumber()
  THROTTLE_TTL: number;

  @IsNumber()
  THROTTLE_LIMIT: number;

  @IsString()
  OPENAI_API_KEY: string;

  @IsString()
  ANTHROPIC_API_KEY: string;
}
