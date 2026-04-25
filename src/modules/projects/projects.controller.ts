import { Controller, Get, Post, Delete, Patch, Param, Body } from "@nestjs/common";
import { ProjectService } from "./projects.service";
import { ChatService } from "../chat/chat.service";
import type { ChatRequest } from "../chat/types/chat-request.type";
import type { ChatResponse } from "../chat/types/chat-response.type";
import { CreateProjectDto } from "./dtos/create-project.dto";
import { UpdateProjectDto } from "./dtos/update-project.dto";
import { Entity } from "src/decorators/entity.decorator";
import { ProjectEntity } from "./entities/project.entity";

@Controller("projects")
@Entity({ type: ProjectEntity })
export class ProjectsController {
  constructor(
    readonly projectService: ProjectService,
    readonly chatService: ChatService,
  ) {}

  @Post()
  async create(@Body() createProjectDto: CreateProjectDto) {
    return this.projectService.create(createProjectDto);
  }

  @Get()
  @Entity({ type: ProjectEntity })
  async findAll() {
    return this.projectService.findAll();
  }

  @Get(":projectid")
  async findOne(@Param("projectid") projectid: string) {
    return this.projectService.findOne(projectid);
  }

  @Patch(":projectId")
  async update(@Param("projectId") projectId: string, @Body() updateProjectDto: UpdateProjectDto) {
    return this.projectService.update(projectId, updateProjectDto);
  }

  @Delete(":projectId")
  async remove(@Param("projectId") projectId: string) {
    await this.projectService.remove(projectId);
  }

  @Post(":id/query")
  async query(@Param("id") id: string, @Body() request: ChatRequest): Promise<ChatResponse> {
    return this.chatService.query(id, request);
  }
}
