import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EnvConfig } from "src/modules/env/env.config";

@Injectable()
export class EnvService {
  constructor(readonly configService: ConfigService<EnvConfig, true>) {}

  get<K extends keyof EnvConfig>(key: K): EnvConfig[K];
  get<K extends keyof EnvConfig>(
    key: K,
    defaultValue: Exclude<EnvConfig[K], undefined>,
  ): Exclude<EnvConfig[K], undefined>;
  get<K extends keyof EnvConfig>(key: K, defaultValue?: EnvConfig[K]): EnvConfig[K] {
    return defaultValue !== undefined
      ? this.configService.get(key, defaultValue, { infer: true })
      : this.configService.get(key, { infer: true });
  }
}
