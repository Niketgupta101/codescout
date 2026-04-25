import { SetMetadata, Type } from "@nestjs/common";
import { AccessConditionDecider } from "../types/access-condition-decider.type";

export const USE_ACCESS_CONDITION_KEY = "UseAccessCondition";

/**
 * Decorator to register an access condition for handler or controller.
 */
export const UseAccessCondition = (condition: Type<AccessConditionDecider>) =>
  SetMetadata(USE_ACCESS_CONDITION_KEY, condition);
