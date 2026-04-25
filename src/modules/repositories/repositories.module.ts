import { forwardRef, Module } from "@nestjs/common";
import { RepositoriesService } from "./repositories.service";
import { RepositoriesController } from "./repositories.controller";
import { PrismaModule } from "../../prisma/prisma.module";
import { IndexingModule } from "../indexing/indexing.module";

@Module({
  imports: [PrismaModule, forwardRef(() => IndexingModule)],
  controllers: [RepositoriesController],
  providers: [RepositoriesService],
  exports: [RepositoriesService],
})
export class RepositoriesModule {}
