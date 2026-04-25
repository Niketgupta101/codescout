import { DynamicModule, Global, Module } from "@nestjs/common";
import { EnvService } from "./env.service";
import { ConfigModule, ConfigModuleOptions } from "@nestjs/config";
import { validateEnv } from "./env.validation";

@Global()
@Module({
  providers: [EnvService],
  exports: [EnvService],
})
export class EnvModule extends ConfigModule {
  static forRoot(options?: ConfigModuleOptions): Promise<DynamicModule> {
    return super.forRoot({
      ...options,
      isGlobal: true,
      validate: validateEnv,
    });
  }
}
