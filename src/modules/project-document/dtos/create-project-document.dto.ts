import { ProjectDocumentProvider } from "@prisma/client";
import { IsOptionalLc } from "src/plugins/locale/class-validator/common-lc.decorator";
import { IsEnumLc, IsStringLc } from "src/plugins/locale/class-validator/typechecker-lc.decorator";
import { IsUUIDLc } from "src/plugins/locale/class-validator/string-lc.decorator";

export class CreateProjectDocumentDto {
  @IsUUIDLc()
  projectId: string;

  @IsOptionalLc()
  @IsUUIDLc()
  projectFolderId?: string;

  @IsEnumLc(ProjectDocumentProvider)
  provider: ProjectDocumentProvider;

  @IsOptionalLc()
  @IsStringLc()
  providerExternalId?: string;
}
