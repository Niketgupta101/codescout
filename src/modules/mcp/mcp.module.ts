import { Global, Module } from "@nestjs/common";
import { McpModule as RekogMcpModule, McpTransportType } from "@rekog/mcp-nest";
import { AccessModule } from "src/libraries/access/access.module";
import { AppAbilityModule } from "src/app-ability/app-ability.module";
import { AuthModule } from "src/modules/auth/auth.module";
import { PrismaModule } from "src/prisma/prisma.module";
import { UserApiKeyModule } from "src/modules/user-api-key/user-api-key.module";
import { McpActorService } from "./mcp-actor.service";

@Global()
@Module({
  imports: [
    RekogMcpModule.forRoot({
      name: "code-chat",
      version: "1.0.0",
      transport: McpTransportType.STREAMABLE_HTTP,
      // returned to clients during MCP initialize; nudges clients (Claude Desktop etc.) to load related code-question tools together as a coordinated set
      // some clients load tools lazily by keyword search, which can hide partner tools (e.g. codeFileReadRange when only codeFileRead is loaded) until the LLM hits a wall
      instructions: [
        "code-chat exposes a small set of primitives meant to be used together for code questions.",
        "Load these as a coordinated set: codeFileSearch, codeFileRead, codeFileReadRange, symbolSearch.",
        "",
        "Canonical pairings:",
        "- symbolSearch + codeFileReadRange — primary path for any named function/class/method/type. symbolSearch returns startLine/endLine; pass them straight to codeFileReadRange.",
        "- codeFileSearch + codeFileRead — for fuzzy/conceptual questions or small whole-file reads.",
        "",
        "Rules of thumb:",
        "- If you know a symbol name, start with symbolSearch — never read_file a large service file just to find one function.",
        "- codeFileRead returns the entire file with no truncation; reserve it for small files (controllers, DTOs, types).",
        "- For server-side agentic Q&A, also see chatMessageCreate — it drives the same primitives internally and returns raw findings.",
      ].join("\n"),
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
    UserApiKeyModule,
  ],
  providers: [McpActorService],
  exports: [McpActorService],
})
export class McpModule {}
