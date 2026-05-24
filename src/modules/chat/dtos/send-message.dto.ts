import { IsString, IsOptional, IsNumber, Min, IsIn, ValidateIf, IsBoolean } from "class-validator";
import type { LLMProvider } from "../../llm/types/llm-provider.type";

export class SendMessageDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  // model and provider required when conversationId not provided AND persistence is requested
  @ValidateIf((o: SendMessageDto) => !o.conversationId && o.persist !== false)
  @IsString()
  model?: string;

  @ValidateIf((o: SendMessageDto) => !o.conversationId && o.persist !== false)
  @IsIn(["openai", "anthropic"])
  provider?: LLMProvider;

  @IsOptional()
  @IsString()
  conversationTitle?: string;

  // controls whether a brand-new exchange is persisted as a Conversation + Messages
  // ignored when conversationId is provided (continuing a conversation always persists)
  // REST controller defaults this to true to preserve existing web-UI auto-create behavior
  @IsOptional()
  @IsBoolean()
  persist?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxIterations?: number;

  @IsOptional()
  @IsNumber()
  @Min(1000)
  timeoutMs?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  includeLastNMessages?: number;
}
