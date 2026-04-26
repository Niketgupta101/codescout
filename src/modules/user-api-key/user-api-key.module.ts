import { Module } from "@nestjs/common";
import { PrismaModule } from "src/prisma/prisma.module";
import { UserApiKeyController } from "./user-api-key.controller";
import { UserApiKeyService } from "./user-api-key.service";

@Module({
  imports: [PrismaModule],
  controllers: [UserApiKeyController],
  providers: [UserApiKeyService],
  exports: [UserApiKeyService],
})
export class UserApiKeyModule {}
