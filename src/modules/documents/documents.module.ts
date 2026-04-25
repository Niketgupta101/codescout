import { forwardRef, Module } from "@nestjs/common";
import { DocumentsService } from "./documents.service";
import { DocumentsController } from "./documents.controller";
import { PrismaModule } from "../../prisma/prisma.module";
import { IndexingModule } from "../indexing/indexing.module";

@Module({
  imports: [PrismaModule, forwardRef(() => IndexingModule)],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
