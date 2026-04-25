import { IsString, IsOptional, IsNumber, Min, IsIn, ValidateIf } from "class-validator";
import type { LLMProvider } from "../../llm/types/llm-provider.type";

export class SendMessageDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  // model and provider required when conversationId not provided
  @ValidateIf((o: SendMessageDto) => !o.conversationId)
  @IsString()
  model?: string;

  @ValidateIf((o: SendMessageDto) => !o.conversationId)
  @IsIn(["openai", "anthropic"])
  provider?: LLMProvider;

  @IsOptional()
  @IsString()
  conversationTitle?: string;

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
