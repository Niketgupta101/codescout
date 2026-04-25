import { Injectable } from "@nestjs/common";
import { AccessSubjectFieldsInformer } from "../types/access-subject-fields-informer.type";
import { RequestWithAccessContext } from "../types/request-with-access-context.type";

export type FieldsInRequestFrom = ("body" | "query" | "params")[];

/**
 * Provides subject fields from the request, to be used as the `with` option
 * for the condition factory `Condition({ can: ..., with: FieldsInRequest(["params", "body"]) })`
 **/
export const FieldsInRequest = (from: FieldsInRequestFrom = ["body"]) => {
  @Injectable()
  class RequestFieldsInformer implements AccessSubjectFieldsInformer {
    async informAccessSubjectFields(request: RequestWithAccessContext): Promise<string[]> {
      return from.flatMap((key) => Object.keys((request[key] as object | undefined) ?? {}));
    }
  }

  return RequestFieldsInformer;
};
