import { AnyAbility } from "@casl/ability";
import { RequestWithAccessContext } from "./request-with-access-context.type";
import { AccessCaslPrismaAbility, AccessCaslPrismaLikeAbility } from "./access-casl-prisma.type";

export type AccessConditionDecision = {
  /** `true` if access is granted */
  granted: boolean;

  /** `true` if access is conditional, useful for returning 404 instead of 403 when conditonal access is denied */
  conditional?: boolean;

  /** Context for generating error messages */
  context?: {
    action: string;
    subjectType?: string;
    field?: string;
  };
};

/**
 * Interface that contains the condition to decide if access is granted.
 * Analogous to PDP or Policy Decision Point
 */
export type AccessConditionDecider<TAbility extends AccessCaslPrismaLikeAbility = AccessCaslPrismaAbility> = {
  decideAccessCondition(
    ability: AnyAbility,
    request: RequestWithAccessContext<TAbility>,
  ): Promise<AccessConditionDecision>;
};
