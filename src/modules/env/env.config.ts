import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from "class-validator";
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

  @IsOptional()
  @IsString()
  OPENAI_BASE_URL?: string;

  @IsString()
  OPENAI_API_KEY: string;

  @IsOptional()
  @IsString()
  OPENAI_EMBEDDING_BASE_URL?: string;

  @IsOptional()
  @IsString()
  OPENAI_EMBEDDING_API_KEY?: string;

  @IsString()
  OPENAI_DEFAULT_INFERENCE_MODEL: string;

  @IsString()
  OPENAI_DEFAULT_EMBEDDING_MODEL: string;

  // Local OpenAI-compatible servers usually serialize generations and need a longer per-request timeout.
  @IsOptional()
  @IsInt()
  @Min(1000)
  OPENAI_INFERENCE_TIMEOUT_MS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  OPENAI_INFERENCE_CONCURRENCY?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  OPENAI_DOCUMENT_EXTRACTION_CHUNK_TOKENS?: number;

  @IsOptional()
  @IsInt()
  @Min(1024)
  OPENAI_PIPELINE_MAX_COMPLETION_TOKENS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  RECONCILE_CONCURRENCY?: number;

  @IsString()
  ANTHROPIC_API_KEY: string;

  // base64-encoded service account json for read-only google drive folder indexing
  @IsOptional()
  @IsString()
  GOOGLE_SERVICE_ACCOUNT_KEY_BASE64?: string;

  @IsOptional()
  @IsNumber()
  AGENT_TIMEOUT_MS?: number;

  // max output tokens per LLM call (research iterations + answer generation)
  // default 16384 is the safe ceiling across our providers; raise if logs show "response truncated" warnings
  @IsOptional()
  @IsNumber()
  AGENT_MAX_OUTPUT_TOKENS?: number;

  @IsOptional()
  @IsString()
  STYTCH_PROJECT_ID?: string;

  @IsOptional()
  @IsString()
  STYTCH_SECRET?: string;

  // public token used by the browser consent page
  @IsOptional()
  @IsString()
  STYTCH_PUBLIC_TOKEN?: string;

  @IsOptional()
  @IsString()
  STYTCH_DOMAIN?: string;

  @IsString()
  APP_PUBLIC_URL: string;
}
