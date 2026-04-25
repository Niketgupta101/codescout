import { detectSubjectType } from "@casl/ability";
import { AccessConditionDecider, AccessConditionDecision } from "../types/access-condition-decider.type";
import { AccessSubjectFieldsInformer } from "../types/access-subject-fields-informer.type";
import { AccessSubjectInstanceInformer } from "../types/access-subject-instance-informer.type";
import { RequestWithAccessContext } from "../types/request-with-access-context.type";
import {
  AccessCaslPrismaAction,
  AccessCaslPrismaLikeAbility,
  AccessCaslPrismaSubjectModel,
  AccessCaslPrismaSubjectType,
} from "../types/access-casl-prisma.type";
import { Injectable, Type } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";

export type ConditionAction = Extract<AccessCaslPrismaAction, "read" | "create" | "update" | "delete">;
export type ConditionCommonOptions = {
  with?: string | string[] | Type<AccessSubjectFieldsInformer>;
};

export type ConditionOptions =
  | ({ can: ConditionAction; any: AccessCaslPrismaSubjectType } & ConditionCommonOptions)
  | ({ can: ConditionAction; one: Type<AccessSubjectInstanceInformer> } & ConditionCommonOptions);

/** Creates a condition to be enforced by the access interceptor */
export const Condition = ({ can: action, with: fieldOrFieldsInformer, ...options }: ConditionOptions) => {
  @Injectable()
  class CaslPrismaConditionDecider<TAbility extends AccessCaslPrismaLikeAbility> implements AccessConditionDecider {
    constructor(readonly moduleRef: ModuleRef) {}

    async decideAccessCondition(
      ability: TAbility,
      request: RequestWithAccessContext,
    ): Promise<AccessConditionDecision> {
      let subjectType: AccessCaslPrismaSubjectType;
      let subjectModel: AccessCaslPrismaSubjectModel | undefined;

      if ("any" in options) {
        subjectType = options.any;
        //
      } else if ("one" in options) {
        const subjectInformer = await this.moduleRef.create(options.one);
        subjectModel = await subjectInformer.informAccessSubjectInstance(request);
        subjectType = detectSubjectType(subjectModel) as AccessCaslPrismaSubjectType;
        //
      } else {
        throw new Error('Conditon must define either "any" or "one" option');
      }

      let fields: string[];
      if (typeof fieldOrFieldsInformer === "string") {
        fields = [fieldOrFieldsInformer];
        //
      } else if (Array.isArray(fieldOrFieldsInformer)) {
        fields = fieldOrFieldsInformer;
        //
      } else if (typeof fieldOrFieldsInformer !== "undefined") {
        const fieldsInformer = await this.moduleRef.create(fieldOrFieldsInformer);
        fields = await fieldsInformer.informAccessSubjectFields(request);
        //
      } else {
        fields = [];
      }

      if (!ability.can(action, subjectType)) {
        return { granted: false, context: { action, subjectType } };
      }
      if (subjectModel && !ability.can(action, subjectModel)) {
        return { granted: false, conditional: true, context: { action, subjectType } };
      }
      for (const field of fields) {
        if (!ability.can(action, subjectType, field)) {
          return { granted: false, context: { action, subjectType, field } };
        }
        if (subjectModel && !ability.can(action, subjectModel, field)) {
          return { granted: false, conditional: true, context: { action, subjectType, field } };
        }
      }

      return { granted: true };
    }
  }

  return CaslPrismaConditionDecider;
};
