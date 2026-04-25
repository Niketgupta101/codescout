import { IsString, IsOptional, IsEnum } from "class-validator";
import { DocumentStatus } from "@prisma/client";

export class UpdateDocumentStatusDto {
  @IsString()
  @IsEnum(DocumentStatus)
  status: DocumentStatus;

  @IsOptional()
  @IsString()
  error?: string;
}
