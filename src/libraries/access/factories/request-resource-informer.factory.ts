import { Injectable } from "@nestjs/common";
import { RequestWithAccessContext } from "../types/request-with-access-context.type";
import { AccessCaslPrismaSubjectModel, AccessCaslPrismaSubjectType } from "../types/access-casl-prisma.type";
import { AccessSubjectInstanceInformer } from "../types/access-subject-instance-informer.type";
import { subject } from "@casl/ability";

export type ResourceInRequestFrom = ("body" | "query" | "params")[];

/**
 * Provides subject instance from the request, to be used as the create `one` option
 * for the condition factory `Condition({ can: "create", one: ResourceInRequest("User"), ... })`
 **/
export const ResourceInRequest = (
  subjectType: AccessCaslPrismaSubjectType,
  from: ResourceInRequestFrom = ["params", "body"],
) => {
  @Injectable()
  class RequestResourceInformer implements AccessSubjectInstanceInformer {
    async informAccessSubjectInstance(request: RequestWithAccessContext): Promise<AccessCaslPrismaSubjectModel> {
      const input = from.reduce(
        (acc, key) => ({ ...acc, ...(request[key] as object | undefined) }),
        {} as Record<string, unknown>,
      );

      return subject(subjectType, input) as unknown as AccessCaslPrismaSubjectModel;
    }
  }

  return RequestResourceInformer;
};
