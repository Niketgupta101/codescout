import { DocumentType } from "@prisma/client";
import { IsEnumLc } from "src/plugins/locale/class-validator/typechecker-lc.decorator";

export class IndexDocumentDto {
  @IsEnumLc(DocumentType)
  documentType: DocumentType;
}
