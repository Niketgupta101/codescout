import { ProjectTopicType } from "@prisma/client";

// a canonical topic to be created, with its summary already embedded so the write runs inside one transaction
export type ProjectReconcileTopicPayload = {
  name: string;
  type: ProjectTopicType | null;
  summary: string;
  embedding: number[];
  memberNames: string[];
};
