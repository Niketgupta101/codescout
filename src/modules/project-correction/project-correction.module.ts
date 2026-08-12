import { Module } from "@nestjs/common";
import { ProjectCorrectionService } from "./project-correction.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { OpenAIModule } from "../openai/openai.module";

@Module({
  imports: [PrismaModule, OpenAIModule],
  providers: [ProjectCorrectionService],
  exports: [ProjectCorrectionService],
})
export class ProjectCorrectionModule {}
