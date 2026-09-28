import { Global, Module } from "@nestjs/common";
import { McpModule as RekogMcpModule, McpTransportType } from "@rekog/mcp-nest";
import { AccessModule } from "src/libraries/access/access.module";
import { AppAbilityModule } from "src/app-ability/app-ability.module";
import { AuthModule } from "src/modules/auth/auth.module";
import { PrismaModule } from "src/prisma/prisma.module";
import { McpActorService } from "./mcp-actor.service";
import { StytchModule } from "../stytch/stytch.module";
import { McpAuthService } from "../mcp-auth/mcp-auth.service";
import { OAuthModule } from "../oauth/oauth.module";

@Global()
@Module({
  imports: [
    RekogMcpModule.forRoot({
      name: "codescout",
      version: "1.0.0",
      transport: McpTransportType.STREAMABLE_HTTP,
      // returned to clients during MCP initialize, so this is the only place a client learns what the server is for
      // before it picks a tool. it states the domain, routes a question to one tool, and names the two behaviours a
      // model cannot infer from a tool signature: that retrieval is phrasing-sensitive, and that statements read as
      // current state. the load-together lists exist because some clients resolve tools lazily by keyword, which hides
      // a partner tool (codeFileReadRange when only codeFileRead matched) until the model has already given up
      instructions: [
        "codescout is a project brain. It indexes a team's documents (Drive folders, meeting transcripts, specs, chat logs) and code repositories into one queryable graph, and answers what a project decided, what is still outstanding, and how the code implements it. Use it for questions about a specific project's history, decisions, commitments and code - not as a general knowledge source.",
        "",
        "Start with projectList to discover projects and their ids. Every other tool takes projectId, or gitRemoteUrl which resolves to it.",
        "",
        "Route the question to a tool:",
        "- What was decided, what is true now -> projectStatementSearch. Returns current state only; pass includeSuperseded true to trace how a decision changed over time or what was rejected.",
        "- What is still outstanding, and who owns it -> projectActionItemList (canonical deduped commitments; filter by status, owner or topic).",
        "- What is this project about -> projectTopicList, projectGet.",
        "- A detail that statement extraction did not capture -> projectDocumentSearch, then projectDocumentRead or projectDocumentReadRange on the documentId it returns.",
        "- An exact name, identifier or phrase -> projectDocumentTextSearch. It is literal and case-insensitive; semantic search misses these.",
        "- Where a claim came from -> projectReferenceList.",
        "- Code, when you know the symbol name -> symbolSearch, then codeFileReadRange with the startLine and endLine it returns. Never read a large service file just to find one function.",
        "- Code, when the question is conceptual -> codeFileSearch, then codeFileRead. codeFileRead returns the whole file untruncated, so reserve it for small ones.",
        "- Project layout -> projectFileTreeGet.",
        "- 'Do we have X in any project?' -> codeFileSearch or symbolSearch with NO projectId or gitRemoteUrl. Each hit carries projectId and projectName; scope the follow-up reads to the project it points at.",
        "",
        "Retrieval is phrasing-sensitive: an empty or irrelevant semantic result does NOT mean the information is absent. Re-query with different wording, then widen projectStatementSearch -> projectDocumentSearch -> projectDocumentTextSearch. Report 'not found' only after the literal search has also missed.",
        "",
        "Load each set together, because a client that resolves tools lazily will otherwise hide the partner you need:",
        "- documents: projectStatementSearch, projectDocumentSearch, projectDocumentTextSearch, projectDocumentRead, projectDocumentReadRange",
        "- code: codeFileSearch, symbolSearch, codeFileRead, codeFileReadRange",
        "",
        "Corrections, which write and persist: projectActionItemUpdate, projectTopicCorrect, projectStatementCorrect, projectReferenceCorrect. Each pins the record as human-set so re-imports and automated recomputation leave it alone. Use them to fix a graph that is wrong, not to file new information.",
        "",
        "Ingestion: projectCreate, projectFolderCreate, projectFolderImport with projectFolderImportStatus, projectFolderDelete, projectDocumentCreate, repositoryIndex with repositoryStatusGet, repositoryList. Imports and indexing run in the background - poll the matching status tool rather than assuming completion.",
        "",
        "Maintenance, expensive and never speculative: projectReconcile (re-canonicalizes topics and action items, and already runs after every import), projectStatementThread (supersession threading), projectActionItemResolve (judges action items done from document evidence).",
        "",
        "chatMessageCreate delegates to a server-side research agent, but that agent searches code only and never queries documents. Do not route decision or document questions through it - drive the document tools yourself.",
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
    StytchModule,
    OAuthModule,
  ],
  providers: [McpActorService, McpAuthService],
  exports: [McpActorService, McpAuthService],
})
export class McpModule {}
