import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateProjectDto } from "./dtos/create-project.dto";
import { UpdateProjectDto } from "./dtos/update-project.dto";
import { LocaleException } from "src/plugins/locale/nest/locale.exception";

@Injectable()
export class ProjectService {
  readonly logger = new Logger(ProjectService.name);

  constructor(readonly prisma: PrismaService) {}

  async create(createProjectDto: CreateProjectDto) {
    const existingProject = await this.prisma.project.findUnique({
      where: { name: createProjectDto.name },
    });

    if (existingProject) {
      throw LocaleException.conflict({ message: "module.project.projectNameUnavailableError" });
    }

    return this.prisma.project.create({
      data: {
        name: createProjectDto.name,
        description: createProjectDto.description,
      },
    });
  }

  async findAll() {
    const projects = await this.prisma.project.findMany({
      orderBy: { createdAt: "desc" },
    });

    return {
      items: projects,
      total: projects.length,
    };
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      throw LocaleException.notFound();
    }

    return project;
  }

  async update(id: string, updateProjectDto: UpdateProjectDto) {
    await this.findOne(id); // ensure resource exists

    return this.prisma.project.update({
      where: { id },
      data: updateProjectDto,
    });
  }

  async remove(projectId: string) {
    const project = await this.findOne(projectId); // ensure resource exists

    await this.prisma.$transaction([
      this.prisma.repositoryFile.deleteMany({ where: { projectId } }),
      this.prisma.repositoryFileSymbol.deleteMany({ where: { projectId } }),
      this.prisma.repository.deleteMany({ where: { projectId } }),
      this.prisma.projectDocument.deleteMany({ where: { projectId } }),
      this.prisma.conversation.deleteMany({ where: { projectId } }),
      this.prisma.project.delete({ where: { id: projectId } }),
    ]);

    return project;
  }
}
