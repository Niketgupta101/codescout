import { Request } from "express";
import { AccessContext } from "../contexts/access.context";
import { AccessCaslPrismaAbility, AccessCaslPrismaLikeAbility } from "./access-casl-prisma.type";

export type RequestWithAccessContext<TAbility extends AccessCaslPrismaLikeAbility = AccessCaslPrismaAbility> =
  Request & {
    accessContext?: AccessContext<TAbility>;
  };
