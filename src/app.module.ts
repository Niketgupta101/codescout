import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaModule } from "./prisma/prisma.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { GithubModule } from "./modules/github/github.module";
import { RepositoriesModule } from "./modules/repositories/repositories.module";
import { DocumentsModule } from "./modules/documents/documents.module";
import { AgentModule } from "./modules/agent/agent.module";
import { ChatModule } from "./modules/chat/chat.module";
import { ConversationsModule } from "./modules/conversations/conversations.module";
import { AnthropicModule } from "./modules/anthropic/anthropic.module";
import { LLMModule } from "./modules/llm/llm.module";
import { McpModule } from "./modules/mcp/mcp.module";
import { AppExceptionFilter, EXCEPTION_FACTORY } from "./providers/app-exception.filter";
import { LocaleHttpExceptionFactory } from "./plugins/locale/nest/locale-http-exception.factory";
import { AppResponseSerializerInterceptor } from "./providers/app-response-serializer.interceptor";
import { LocaleSerializerInterceptor } from "./plugins/locale/nest/locale-serializer.interceptor";
import { AuthGuard } from "./modules/auth/auth.guard";
import { AppValidationPipe } from "./app-validation.pipe";
import { MorganMiddleware } from "./providers/morgan.middleware";
import { AuthModule } from "./modules/auth/auth.module";
import { EnvModule } from "./modules/env/env.module";
import { ThrottlerModule } from "@nestjs/throttler";
import { EnvService } from "./modules/env/env.service";
import { AppLogger } from "./providers/app-logger.service";
import { MeModule } from "./modules/me/me.module";
import { UserModule } from "./modules/user/user.module";
import { AccessModule } from "./libraries/access";
import { AppAbilityModule } from "./app-ability/app-ability.module";
import { AppAbilityFactory } from "./app-ability/app-ability.factory";
import { RequestWithUser } from "./modules/auth/types/request-with-user.type";

@Module({
  imports: [
    EnvModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRootAsync({
      imports: [EnvModule],
      inject: [EnvService],
      useFactory: (envService: EnvService) => [
        {
          ttl: envService.get("THROTTLE_TTL"),
          limit: envService.get("THROTTLE_LIMIT"),
        },
      ],
    }),
    AppAbilityModule,
    AccessModule.registerAsync({
      imports: [AppAbilityModule],
      inject: [AppAbilityFactory],
      useFactory: (abilityFactory: AppAbilityFactory) => ({
        userFromRequest: (request: RequestWithUser) => request.user,
        abilityFactory,
      }),
    }),
    PrismaModule,
    AuthModule,
    MeModule,
    UserModule,
    ProjectsModule,
    GithubModule,
    RepositoriesModule,
    DocumentsModule,
    AnthropicModule,
    LLMModule,
    AgentModule,
    ChatModule,
    ConversationsModule,
    McpModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    AppLogger,
    {
      provide: APP_FILTER,
      useClass: AppExceptionFilter,
    },
    {
      provide: EXCEPTION_FACTORY,
      useClass: LocaleHttpExceptionFactory,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AppResponseSerializerInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LocaleSerializerInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_PIPE,
      useClass: AppValidationPipe,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MorganMiddleware).forRoutes("*");
  }
}
