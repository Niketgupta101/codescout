import { ConfigurableModuleBuilder } from "@nestjs/common";
import { AccessModuleOptions } from "./types/access-module-options.type";

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN, OPTIONS_TYPE, ASYNC_OPTIONS_TYPE } =
  new ConfigurableModuleBuilder<AccessModuleOptions>().build();
