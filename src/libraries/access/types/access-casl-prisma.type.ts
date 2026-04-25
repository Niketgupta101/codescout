import { Abilities, PureAbility } from "@casl/ability";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaQuery, Subjects } from "@casl/prisma";

/**
 * Map of prisma modal names to modals.
 * See https://github.com/prisma/prisma/discussions/12453#discussioncomment-6405157
 */
export type AccessCaslPrismaModels = {
  [M in Prisma.ModelName]: Exclude<Awaited<ReturnType<PrismaClient[Uncapitalize<M>]["findUnique"]>>, null>;
};

export type AccessCaslPrismaAction = "create" | "read" | "update" | "delete";
export type AccessCaslPrismaSubjects = Subjects<AccessCaslPrismaModels>;
export type AccessCaslPrismaSubjectType = Extract<AccessCaslPrismaSubjects, string>;
export type AccessCaslPrismaSubjectModel = Exclude<AccessCaslPrismaSubjects, string>;
export type AccessCaslPrismaAbility = PureAbility<[AccessCaslPrismaAction, AccessCaslPrismaSubjects], PrismaQuery>;
export type AccessCaslPrismaLikeAbility = PureAbility<Abilities, PrismaQuery>;
