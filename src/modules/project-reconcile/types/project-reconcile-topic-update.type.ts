import { ProjectTopicType } from "@prisma/client";

// a rewritten summary for an existing canonical topic that absorbed new members, embedded ready for the transaction
export type ProjectReconcileTopicUpdate = {
  topicId: string;
  type: ProjectTopicType | null;
  summary: string;
  nameAliases: string[];
  embedding: number[];
};
