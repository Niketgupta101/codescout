import { AccessCaslPrismaLikeAbility } from "./access-casl-prisma.type";

/**
 * Interface that creates casl ability for each request.
 * Can be used to map either application roles or policies to casl rules.
 * Analogous to PRP or Policy Retrieval Point
 */
export type AccessCaslAbilityFactory<TAbility extends AccessCaslPrismaLikeAbility> = {
  createAccessCaslAbility<TUser extends { id: string }>(user: TUser | undefined): TAbility;
};
