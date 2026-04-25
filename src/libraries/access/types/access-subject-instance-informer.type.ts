import { RequestWithAccessContext } from "./request-with-access-context.type";
import {
  AccessCaslPrismaAbility,
  AccessCaslPrismaLikeAbility,
  AccessCaslPrismaSubjectModel,
} from "./access-casl-prisma.type";

/**
 * Interface that provides information about subject instance to evaluate.
 * Analogous to PIP or Policy Information Point
 */
export type AccessSubjectInstanceInformer<TAbility extends AccessCaslPrismaLikeAbility = AccessCaslPrismaAbility> = {
  informAccessSubjectInstance(request: RequestWithAccessContext<TAbility>): Promise<AccessCaslPrismaSubjectModel>;
};
