import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { IndexingService } from "./indexing.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { ParsersModule } from "../parsers/parsers.module";
import { GithubModule } from "../github/github.module";
import { RepositoriesModule } from "../repositories/repositories.module";
import { DocumentsModule } from "../documents/documents.module";
import { OpenAIModule } from "../openai/openai.module";

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    ParsersModule,
    GithubModule,
    forwardRef(() => RepositoriesModule),
    forwardRef(() => DocumentsModule),
    OpenAIModule,
  ],
  providers: [IndexingService],
  exports: [IndexingService],
})
export class IndexingModule {}
