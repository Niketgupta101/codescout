import { plainToInstance } from "class-transformer";
import { EnvConfig } from "./env.config";
import { validateSync } from "class-validator";

export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvConfig, config, { enableImplicitConversion: true });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}
