import { IsOptional, IsString, IsIn } from "class-validator";
import type { LLMProvider } from "../../llm/types/llm-provider.type";

export class CreateConversationDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsIn(["openai", "anthropic"])
  provider?: LLMProvider;
}
