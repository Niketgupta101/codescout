import { accessibleBy } from "@casl/prisma";
import { AccessCaslPrismaAction, AccessCaslPrismaLikeAbility } from "../types/access-casl-prisma.type";
import { Prisma } from "@prisma/client";
import { permittedFieldsOf } from "@casl/ability/extra";
import { AccessExceptionFactory } from "../types/access-exception-factory.type";
import { AccessConditionDecision } from "../types/access-condition-decider.type";
import { detectSubjectType } from "@casl/ability";

/**
 * Access context that holds the casl ability, and helper functions
 * for filtering prisma results and sanitizing data.
 *
 * Usage:
 * ```ts
 * accessContext.getWhereInputFor("read", "User");
 * accessContext.getSanitizedValuesFor("read", "User", input);
 * accessContext.can("read", subject("User", user));
 * accessContext.canOrThrow("read", subject("User", user));
 * accessContext.cannot("read", subject("User", user));
 * accessContext.cannotOrThrow("read", subject("User", user));
 *
 * // returns the native casl ability, however, the use of helper functions is preferred
 * accessContext.ability;
 * ```
 **/
export class AccessContext<TAbility extends AccessCaslPrismaLikeAbility> {
  constructor(
    readonly ability: TAbility,
    readonly exceptionFactory: AccessExceptionFactory,
  ) {}

  /** Returns the prisma where input for find many query for the resource */
  getWhereInputFor<TAction extends AccessCaslPrismaAction, TModelName extends Prisma.ModelName>(
    action: TAction,
    subjectType: TModelName,
  ) {
    return accessibleBy(this.ability, action)[subjectType];
  }

  /** Returns a sanitied input with only permitted fields */
  getSanitizedValuesFor<TInput extends object>(
    action: Parameters<TAbility["can"]>[0],
    subject: Parameters<TAbility["can"]>[1],
    input: TInput,
  ): Partial<TInput> {
    const permittedFields = permittedFieldsOf(this.ability, action, subject, {
      fieldsFrom: (rule) => rule.fields ?? Object.keys(input),
    });

    return Object.fromEntries(
      Object.entries(input).filter(([key]) => permittedFields.includes(key)),
    ) as Partial<TInput>;
  }

  _getExceptionDecision(...args: Parameters<TAbility["can"]>): AccessConditionDecision {
    const [action, subject, field] = args;
    return {
      granted: false,
      conditional: typeof subject !== "string",
      context: {
        action,
        subjectType: subject ? (typeof subject === "string" ? subject : detectSubjectType(subject)) : undefined,
        field,
      },
    };
  }

  /** Convenience function for ability.can(...) */
  can(...args: Parameters<TAbility["can"]>) {
    return this.ability.can(...args);
  }

  /** Assertion function for ability.can(...), throws an exception if false  */
  canOrThrow(...args: Parameters<TAbility["can"]>) {
    if (this.ability.can(...args)) {
      return true;
    }

    const error = Object.assign(new Error("ability.can returned false for args"), { args });
    const decision = this._getExceptionDecision(...args);

    throw this.exceptionFactory(error, decision);
  }

  /** Convenience function for ability.cannot(...) */
  cannot(...args: Parameters<TAbility["cannot"]>) {
    return this.ability.cannot(...args);
  }

  /** Assertion function for ability.cannot(...), throws an exception if false  */
  cannotOrThrow(...args: Parameters<TAbility["cannot"]>) {
    if (this.ability.cannot(...args)) {
      return true;
    }

    const error = Object.assign(new Error("ability.cannot returned false for args"), { args });
    const decision = this._getExceptionDecision(...args);

    throw this.exceptionFactory(error, decision);
  }
}
