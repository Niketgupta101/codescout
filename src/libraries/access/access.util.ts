import { ForcedSubject, subject } from "@casl/ability";
import { Prisma } from "@prisma/client";
import { AccessCaslPrismaModels } from "./types/access-casl-prisma.type";

/** Allows constructing a subject from partial objects */
export const subjectOf =
  <TSubjectType extends Prisma.ModelName>(type: TSubjectType) =>
  <TSubject extends AccessCaslPrismaModels[TSubjectType], TObject extends Partial<TSubject>>(object: TObject) =>
    subject(type, object) as unknown as TSubject & ForcedSubject<TSubjectType>;
