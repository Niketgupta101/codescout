import { Injectable } from "@nestjs/common";
import { AbilityBuilder, PureAbility } from "@casl/ability";
import { PrismaQuery, createPrismaAbility } from "@casl/prisma";
import { AccessCaslAbilityFactory, AccessCaslPrismaAction, AccessCaslPrismaSubjects } from "src/libraries/access";

export type AppAction = AccessCaslPrismaAction;
export type AppSubjects = AccessCaslPrismaSubjects | "all";
export type AppAbility = PureAbility<[AppAction, AppSubjects], PrismaQuery>;

@Injectable()
export class AppAbilityFactory implements AccessCaslAbilityFactory<AppAbility> {
  /**
   * NOTE: The rule of thumb is to define general rules first then more specific ones,
   * as specific inverted rules can be overridden by general rules that come after them.
   * When using a loop to map policies, avoid using inverted rules i.e. "cannot()" to prevent
   * uninteded effects.
   *
   * See https://casl.js.org/v6/en/guide/define-rules#inverted-rules-order
   **/
  createAccessCaslAbility({
    id: userId,
  }: {
    id?: string;
  } = {}): AppAbility {
    const { can, build } = new AbilityBuilder<AppAbility>(createPrismaAbility);

    // handle unauthorized users
    if (!userId) {
      return build();
    }

    // handle implicit permissions
    // operations on own user must be done through `/me`
    // NOTE: service must prevent all users from updating their `enabled` property

    // dev permissions: authenticated users can read everything and manage their own projects
    // refine these rules per-resource before going to multi-tenant prod
    can("read", "all");
    can("create", "all");
    can("update", "all");
    can("delete", "all");

    return build();
  }
}
