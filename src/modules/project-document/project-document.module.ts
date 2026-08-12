import { Module } from "@nestjs/common";
import { ProjectDocumentService } from "./project-document.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { GoogleDriveModule } from "../google-drive/google-drive.module";
import { MarkitdownModule } from "../markitdown/markitdown.module";
import { IndexingModule } from "../indexing/indexing.module";

@Module({
  imports: [PrismaModule, GoogleDriveModule, MarkitdownModule, IndexingModule],
  providers: [ProjectDocumentService],
  exports: [ProjectDocumentService],
})
export class ProjectDocumentModule {}
