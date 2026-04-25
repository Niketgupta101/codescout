import { DynamicModule, Module } from "@nestjs/common";
import {
  ASYNC_OPTIONS_TYPE,
  ConfigurableModuleClass,
  MODULE_OPTIONS_TOKEN,
  OPTIONS_TYPE,
} from "./access.module-definition";
import { APP_GUARD } from "@nestjs/core";
import { AccessContextCreatorInternalGuard } from "./guards/access-context-creator-internal.guard";
import { AccessContextService } from "./services/access-context.service";

@Module({})
export class AccessModule extends ConfigurableModuleClass {
  static register(options: typeof OPTIONS_TYPE): DynamicModule {
    return this._configure(super.register(options));
  }

  static registerAsync(options: typeof ASYNC_OPTIONS_TYPE): DynamicModule {
    return this._configure(super.registerAsync(options));
  }

  static _configure(dynamicModule: DynamicModule): DynamicModule {
    return {
      ...dynamicModule,
      global: true,
      providers: [
        ...(dynamicModule.providers ?? []),
        // create access context globally to be used by access guards
        {
          provide: APP_GUARD,
          useClass: AccessContextCreatorInternalGuard,
        },
        AccessContextService,
      ],
      exports: [
        ...(dynamicModule.exports ?? []),
        // export module options globally to be used by access guards
        MODULE_OPTIONS_TOKEN,
        AccessContextService,
      ],
    };
  }
}
