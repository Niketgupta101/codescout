import { Module } from "@nestjs/common";
import { ProjectService } from "./projects.service";
import { ProjectsController } from "./projects.controller";
import { PrismaModule } from "../../prisma/prisma.module";
import { ChatModule } from "../chat/chat.module";

@Module({
  imports: [PrismaModule, ChatModule],
  controllers: [ProjectsController],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectsModule {}
