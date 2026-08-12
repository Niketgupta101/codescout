import { ProjectFolderProvider } from "@prisma/client";
import { IsStringLc, IsEnumLc } from "src/plugins/locale/class-validator/typechecker-lc.decorator";

export class CreateProjectFolderDto {
  @IsStringLc()
  name: string;

  @IsEnumLc(ProjectFolderProvider)
  provider: ProjectFolderProvider;

  @IsStringLc()
  providerId: string;
}
