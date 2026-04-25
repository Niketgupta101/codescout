import { AccessConditionDecision } from "./access-condition-decider.type";

export type AccessExceptionFactory = (
  error: unknown,
  decision?: Pick<AccessConditionDecision, "conditional" | "context">,
) => unknown;
