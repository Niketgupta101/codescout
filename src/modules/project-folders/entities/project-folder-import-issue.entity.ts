import { Expose } from "class-transformer";

@Expose()
export class ProjectFolderImportIssueEntity {
  path: string;
  status: "skipped" | "failed";
  reason: string;
}
