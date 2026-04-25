import { Module } from "@nestjs/common";
import { MeController } from "./me.controller";
import { AuthModule } from "../auth/auth.module";
import { UserModule } from "../user/user.module";
import { MeService } from "./me.service";

@Module({
  imports: [AuthModule, UserModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
