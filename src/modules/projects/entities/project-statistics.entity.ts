import { Expose, Transform } from "class-transformer";
import { transformExposeAllNested } from "src/utils/class-transformer.util";

@Expose()
export class ProjectStatistics {
  totalFiles: number;

  @Transform(transformExposeAllNested())
  filesByLanguage: unknown;

  totalSymbols: number;
  lastUpdated: Date | null;
}
