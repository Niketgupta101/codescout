import { forwardRef, Module } from "@nestjs/common";
import { McpModule as RekogMcpModule } from "@rekog/mcp-nest";
import { RepositoriesService } from "./repositories.service";
import { RepositoriesController } from "./repositories.controller";
import { RepositoriesMcp } from "./repositories.mcp";
import { PrismaModule } from "../../prisma/prisma.module";
import { IndexingModule } from "../indexing/indexing.module";

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => IndexingModule),
    RekogMcpModule.forFeature([RepositoriesMcp], "code-chat"),
  ],
  controllers: [RepositoriesController],
  providers: [RepositoriesService, RepositoriesMcp],
  exports: [RepositoriesService],
})
export class RepositoriesModule {}
