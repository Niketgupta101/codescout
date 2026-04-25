import { Module } from "@nestjs/common";
import { LLMService } from "./llm.service";
import { OpenAIModule } from "../openai/openai.module";
import { AnthropicModule } from "../anthropic/anthropic.module";

@Module({
  imports: [OpenAIModule, AnthropicModule],
  providers: [LLMService],
  exports: [LLMService],
})
export class LLMModule {}
