import { AccessCaslPrismaAbility, AccessCaslPrismaLikeAbility } from "./access-casl-prisma.type";
import { RequestWithAccessContext } from "./request-with-access-context.type";

/**
 * Interface that provides information about subject fields to evaluate.
 * Analogous to PIP or Policy Information Point
 */
export type AccessSubjectFieldsInformer<TAbility extends AccessCaslPrismaLikeAbility = AccessCaslPrismaAbility> = {
  informAccessSubjectFields(request: RequestWithAccessContext<TAbility>): Promise<string[]>;
};
