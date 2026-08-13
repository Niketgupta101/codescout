import { Module } from "@nestjs/common";
import { ProjectFolderService } from "./project-folders.service";
import { ProjectFoldersController } from "./project-folders.controller";
import { PrismaModule } from "../../prisma/prisma.module";
import { ProjectDocumentModule } from "../project-document/project-document.module";
import { MarkitdownModule } from "../markitdown/markitdown.module";
import { GoogleDriveModule } from "../google-drive/google-drive.module";
import { ProjectReconcileModule } from "../project-reconcile/project-reconcile.module";
import { McpModule as RekogMcpModule } from "@rekog/mcp-nest";
import { ProjectFolderMcp } from "./project-folders.mcp";

@Module({
  imports: [
    PrismaModule,
    ProjectDocumentModule,
    MarkitdownModule,
    GoogleDriveModule,
    ProjectReconcileModule,
    RekogMcpModule.forFeature([ProjectFolderMcp], "codescout"),
  ],
  controllers: [ProjectFoldersController],
  providers: [ProjectFolderService, ProjectFolderMcp],
  exports: [ProjectFolderService],
})
export class ProjectFoldersModule {}
