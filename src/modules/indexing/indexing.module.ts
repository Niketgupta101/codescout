import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { IndexingCostService } from "./indexing-cost.service";
import { IndexingService } from "./indexing.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { ParsersModule } from "../parsers/parsers.module";
import { GithubModule } from "../github/github.module";
import { RepositoriesModule } from "../repositories/repositories.module";
import { OpenAIModule } from "../openai/openai.module";

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    ParsersModule,
    GithubModule,
    forwardRef(() => RepositoriesModule),
    OpenAIModule,
  ],
  providers: [IndexingService, IndexingCostService],
  exports: [IndexingService, IndexingCostService],
})
export class IndexingModule {}
