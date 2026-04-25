import { IsString, IsOptional, IsEnum } from "class-validator";
import { DocumentFormat, DocumentType, Prisma } from "@prisma/client";

export class CreateDocumentDto {
  @IsString()
  projectId: string;

  @IsString()
  filename: string;

  @IsString()
  @IsEnum(DocumentFormat)
  format: DocumentFormat;

  @IsOptional()
  @IsEnum(DocumentType)
  documentType?: DocumentType;

  @IsOptional()
  metadata?: Prisma.InputJsonValue;
}
