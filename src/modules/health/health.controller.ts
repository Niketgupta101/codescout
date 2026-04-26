import { Controller, Get, HttpCode, HttpStatus, Res } from "@nestjs/common";
import { Response } from "express";
import { Public } from "../auth/decorators/public.decorator";
import { Entity } from "src/decorators/entity.decorator";
import { HealthEntity } from "./entities/health.entity";
import { HealthService } from "./health.service";

@Controller("health")
@Entity({ type: HealthEntity })
export class HealthController {
  constructor(readonly healthService: HealthService) {}

  // unauthenticated liveness + outbound-connectivity probe, used by render's health check
  // returns 200 when google is reachable, 503 otherwise so render flags the instance as unhealthy after the configured retry threshold
  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  async getHealth(@Res({ passthrough: true }) res: Response): Promise<HealthEntity> {
    const outboundReachable = await this.healthService.pingGoogle();

    // returning 503 when outbound is broken lets render flag the instance unhealthy
    // the response shape stays stable; consumers don't learn what we're probing internally
    if (!outboundReachable) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return {
      status: outboundReachable ? "ok" : "degraded",
      checkedAt: new Date(),
    };
  }
}
