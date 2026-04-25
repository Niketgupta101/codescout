import { Module } from "@nestjs/common";
import { ParsersService } from "./parsers.service";

@Module({
  providers: [ParsersService],
  exports: [ParsersService],
})
export class ParsersModule {}
