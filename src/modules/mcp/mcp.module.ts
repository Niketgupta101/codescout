import { Global, Module } from "@nestjs/common";
import { McpModule as RekogMcpModule, McpTransportType } from "@rekog/mcp-nest";
import { AccessModule } from "src/libraries/access/access.module";
import { AppAbilityModule } from "src/app-ability/app-ability.module";
import { AuthModule } from "src/modules/auth/auth.module";
import { PrismaModule } from "src/prisma/prisma.module";
import { McpActorService } from "./mcp-actor.service";

@Global()
@Module({
  imports: [
    RekogMcpModule.forRoot({
      name: "code-chat",
      version: "1.0.0",
      transport: McpTransportType.STREAMABLE_HTTP,
      // auth is enforced inline by McpActorService.actorResolve at the start of every tool
      allowUnauthenticatedAccess: true,
      // stateless mode: each request stands alone, no Mcp-Session-Id required
      // simpler for HTTP clients and fine since our tools are all stateless lookups
      streamableHttp: {
        statelessMode: true,
      },
    }),
    AccessModule,
    AppAbilityModule,
    AuthModule,
    PrismaModule,
  ],
  providers: [McpActorService],
  exports: [McpActorService],
})
export class McpModule {}
