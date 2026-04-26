import { Controller, Get, Delete, Post, Param, Body, HttpCode, HttpStatus, UploadedFiles, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { DocumentsService } from "./documents.service";
import { IndexDocumentDto } from "./dtos/index-document.dto";
import { createFileUploadOptions } from "src/utils/file-upload.util";

@Controller("projects/:projectId/documents")
export class DocumentsController {
  constructor(readonly documentsService: DocumentsService) {}

  @Post()
  @UseInterceptors(
    FilesInterceptor(
      "files",
      10,
      createFileUploadOptions({
        allowedExtensions: [".csv", ".md", ".markdown", ".pdf"],
        maxFiles: 10,
        maxFileSize: 10 * 1024 * 1024,
      }),
    ),
  )
  async index(
    @Param("projectId") projectId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() indexDocumentDto: IndexDocumentDto,
  ) {
    return this.documentsService.index(projectId, {
      files,
      documentType: indexDocumentDto.documentType,
    });
  }

  @Get()
  async listDocuments(@Param("projectId") projectId: string) {
    return this.documentsService.findByProject(projectId);
  }

  @Get(":documentId")
  async getDocument(@Param("projectId") projectId: string, @Param("documentId") documentId: string) {
    return this.documentsService.findOne(projectId, documentId);
  }

  @Delete(":documentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDocument(@Param("projectId") projectId: string, @Param("documentId") documentId: string) {
    await this.documentsService.delete(projectId, documentId);
  }
}
