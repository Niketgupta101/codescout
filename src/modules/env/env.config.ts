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

  // comma-separated list of origins allowed to make credentialed requests, e.g. "https://app.example.com,http://localhost:3000"
  // requests with no Origin header (server-to-server, MCP clients) bypass this check
  // when unset, no cross-origin browser requests are allowed (safer default than allow-all)
  @IsOptional()
  @IsString()
  CORS_ORIGINS_ALLOWED?: string;

  @IsNumber()
  THROTTLE_TTL: number;

  @IsNumber()
  THROTTLE_LIMIT: number;

  @IsString()
  OPENAI_API_KEY: string;

  @IsString()
  ANTHROPIC_API_KEY: string;

  // optional fallback access token for MCP stdio transport
  // for HTTP+SSE the token is read from the Authorization header
  @IsOptional()
  @IsString()
  MCP_AUTH_TOKEN?: string;

  @IsOptional()
  @IsNumber()
  AGENT_TIMEOUT_MS?: number;

  // max output tokens per LLM call (research iterations + answer generation)
  // default 16384 is the safe ceiling across our providers; raise if logs show "response truncated" warnings
  @IsOptional()
  @IsNumber()
  AGENT_MAX_OUTPUT_TOKENS?: number;
}
