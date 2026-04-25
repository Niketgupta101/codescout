import { ClassSerializerInterceptor, ExecutionContext } from "@nestjs/common";

export class AppResponseSerializerInterceptor extends ClassSerializerInterceptor {
  constructor(reflector: unknown) {
    super(reflector, {
      strategy: "excludeAll",
    });
  }

  // use user access policy type as groups to selectively expose properties
  // see https://github.com/typestack/class-transformer?tab=readme-ov-file#using-groups-to-control-excluded-properties
  getContextOptions(context: ExecutionContext) {
    const options = super.getContextOptions(context);
    // const actor = actorParamFactory(null, context);
    return {
      ...options,
      // groups: actor?.accessPolicies.map((it) => it.type),
    };
  }
}
