import { Type, applyDecorators } from "@nestjs/common";
import { AccessConditionDecider } from "../types/access-condition-decider.type";
import { UseAccessGuard } from "./use-access-guard.decorator";
import { UseAccessCondition } from "./use-access-condition.decorator";

/**
 * Convenience decorator to register an access condition along with
 * the access guard on a handler or controller.
 */
export const Enforce = (condition: Type<AccessConditionDecider>) =>
  applyDecorators(UseAccessGuard(), UseAccessCondition(condition));
