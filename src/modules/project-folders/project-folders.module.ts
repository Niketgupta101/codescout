import { Module } from "@nestjs/common";
import { ProjectFolderService } from "./project-folders.service";
import { ProjectFoldersController } from "./project-folders.controller";
import { PrismaModule } from "../../prisma/prisma.module";
import { ProjectDocumentModule } from "../project-document/project-document.module";
import { MarkitdownModule } from "../markitdown/markitdown.module";
import { GoogleDriveModule } from "../google-drive/google-drive.module";

@Module({
  imports: [PrismaModule, ProjectDocumentModule, MarkitdownModule, GoogleDriveModule],
  controllers: [ProjectFoldersController],
  providers: [ProjectFolderService],
  exports: [ProjectFolderService],
})
export class ProjectFoldersModule {}
