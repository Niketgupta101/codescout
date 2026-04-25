import { Global, Module } from "@nestjs/common";
import { AppAbilityFactory } from "./app-ability.factory";

@Global()
@Module({
  providers: [AppAbilityFactory],
  exports: [AppAbilityFactory],
})
export class AppAbilityModule {}
