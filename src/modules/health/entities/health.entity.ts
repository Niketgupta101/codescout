import { Expose } from "class-transformer";
import { HealthStatus } from "../types/health-status.type";

@Expose()
export class HealthEntity {
  status: HealthStatus;
  checkedAt: Date;
}
