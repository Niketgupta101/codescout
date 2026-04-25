import { Controller, Post, Body, UseGuards, Req, Res } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import { ThrottlerBehindProxyGuard } from "src/plugins/throttler/throttler-behind-proxy.guard";
import { Entity } from "src/decorators/entity.decorator";
import { Public } from "./decorators/public.decorator";
import { EmptyEntity } from "../common/entities/empty.entity";
import { AuthResponseEntity } from "./entities/auth-response.entity";
import { Request, Response } from "express";
import { AuthRefreshEntity } from "./entities/auth-refresh-entity";
import { AuthRefreshDto } from "./dto/auth-refresh.dto";
import { AuthLogoutDto } from "./dto/auth-logout.dto";

@Controller("auth")
@UseGuards(ThrottlerBehindProxyGuard)
@Throttle({ default: { limit: 100, ttl: 60000 } })
@Entity({ type: AuthResponseEntity })
export class AuthController {
  constructor(readonly authService: AuthService) {}

  @Public()
  @Post("login")
  async login(@Res({ passthrough: true }) res: Response, @Body() loginDto: LoginDto) {
    return await this.authService.login(res, loginDto);
  }

  @Public()
  @Post("refresh")
  @Entity({ type: AuthRefreshEntity })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() authRefreshDto: AuthRefreshDto,
  ) {
    return await this.authService.refresh(req, res, authRefreshDto);
  }

  @SkipThrottle()
  @Post("logout")
  @Entity({ type: EmptyEntity })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() authLogoutDto: AuthLogoutDto) {
    return await this.authService.logout({ req, res, authLogoutDto });
  }
}
