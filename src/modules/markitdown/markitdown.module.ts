import { Module } from "@nestjs/common";
import { MarkitdownService } from "./markitdown.service";

@Module({
  providers: [MarkitdownService],
  exports: [MarkitdownService],
})
export class MarkitdownModule {}
