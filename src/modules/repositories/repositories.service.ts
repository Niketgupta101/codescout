import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RepositoryStatus } from "@prisma/client";
import { IndexingService } from "../indexing/indexing.service";
import { CreateRepositoryDto } from "./dtos/create-repository.dto";
import { IndexRepositoryDto } from "./dtos/index-repository.dto";
import { UpdateRepositoryDto } from "./dtos/update-repository.dto";
import { LocaleException } from "src/plugins/locale/nest/locale.exception";

@Injectable()
export class RepositoriesService {
  readonly logger = new Logger(RepositoriesService.name);

  constructor(
    readonly prisma: PrismaService,
    @Inject(forwardRef(() => IndexingService))
    readonly indexingService: IndexingService,
  ) {}

  getRepositoryNameFromUrl(url: string) {
    const match = url.match(/\/([^/]+?)(?:\.git)?$/);
    return match?.[1] ?? "";
  }

  async create(projectId: string, { url, branch, type }: CreateRepositoryDto) {
    return this.prisma.repository.create({
      data: {
        projectId,
        name: this.getRepositoryNameFromUrl(url),
        url,
        branch,
        type,
        status: RepositoryStatus.pending,
      },
    });
  }

  async index(projectId: string, indexRepositoryDto: IndexRepositoryDto) {
    return this.indexingService.indexRepository(projectId, indexRepositoryDto);
  }

  async findAll(projectId: string) {
    const repositories = await this.prisma.repository.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });

    return {
      items: repositories,
      total: repositories.length,
    };
  }

  async findOne(repositoryId: string) {
    const repository = await this.prisma.repository.findFirst({
      where: {
        id: repositoryId,
      },
    });

    if (!repository) {
      throw LocaleException.notFound();
    }

    return repository;
  }

  async findByUrl(projectId: string, url: string) {
    return this.prisma.repository.findFirst({
      where: {
        projectId,
        url,
      },
    });
  }

  async update(
    repositoryId: string,
    updateRepositoryDto: UpdateRepositoryDto & {
      status?: RepositoryStatus;
      lastCommitHash?: string;
      error?: string;
    },
  ) {
    await this.findOne(repositoryId); // check if repository exists

    return this.prisma.repository.update({
      where: { id: repositoryId },
      data: updateRepositoryDto,
    });
  }

  async remove(repositoryId: string) {
    await this.findOne(repositoryId); // ensure resource exists

    const [, , repository] = await this.prisma.$transaction([
      this.prisma.repositoryFileSymbol.deleteMany({
        where: {
          repositoryFile: {
            repositoryId,
          },
        },
      }),
      this.prisma.repositoryFile.deleteMany({
        where: {
          repositoryId,
        },
      }),
      this.prisma.repository.delete({
        where: { id: repositoryId },
      }),
    ]);

    return repository;
  }

  async cancelIndexing(repositoryId: string) {
    const repository = await this.findOne(repositoryId); // ensure resource exists

    // verify that the repository is in a cancellable indexing state
    if (repository.status !== "cloning" && repository.status !== "indexing") {
      throw LocaleException.badRequest({ message: "module.repository.repositoryAlreadyIndexedError" });
    }

    // trigger cancellation via indexing service
    if (this.indexingService.cancelIndexing(repositoryId)) {
      // update repository status to failed with cancellation message
      await this.update(repository.id, {
        status: "failed",
        error: "Indexing cancelled by user",
      });

      this.logger.log(`Cancelled indexing for repository ${repositoryId}`);
    }

    return repository;
  }
}
