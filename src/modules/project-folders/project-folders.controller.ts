import { Controller, Get, Post, Delete, Param, Body, Query } from "@nestjs/common";
import { ProjectFolderService } from "./project-folders.service";
import { CreateProjectFolderDto } from "./dtos/create-project-folder.dto";
import { FindAllProjectFoldersDto } from "./dtos/find-all-project-folders.dto";
import { Entity } from "src/decorators/entity.decorator";
import { ProjectFolderEntity } from "./entities/project-folder.entity";
import { ProjectFolderPageEntity } from "./entities/project-folder-page.entity";
import { ProjectFolderImportEntity } from "./entities/project-folder-import.entity";

@Controller("project/:projectId/project-folders")
@Entity({ type: ProjectFolderEntity })
export class ProjectFoldersController {
  constructor(readonly projectFolderService: ProjectFolderService) {}

  @Post()
  async create(@Param("projectId") projectId: string, @Body() createProjectFolderDto: CreateProjectFolderDto) {
    return this.projectFolderService.create({ projectId, createProjectFolderDto });
  }

  @Get()
  @Entity({ type: ProjectFolderPageEntity })
  async findAll(@Param("projectId") projectId: string, @Query() findAllProjectFoldersDto: FindAllProjectFoldersDto) {
    return this.projectFolderService.findAll(projectId, findAllProjectFoldersDto);
  }

  @Delete(":projectFolderId")
  async remove(@Param("projectFolderId") projectFolderId: string) {
    return this.projectFolderService.remove(projectFolderId);
  }

  @Post(":projectFolderId/import")
  @Entity({ type: ProjectFolderImportEntity })
  async import(@Param("projectFolderId") projectFolderId: string) {
    return this.projectFolderService.projectFolderImportStart(projectFolderId);
  }

  @Get(":projectFolderId/import/:projectFolderImportId")
  @Entity({ type: ProjectFolderImportEntity })
  async importFindOne(
    @Param("projectId") projectId: string,
    @Param("projectFolderImportId") projectFolderImportId: string,
  ) {
    return this.projectFolderService.projectFolderImportFindOne({ projectId, projectFolderImportId });
  }
}
