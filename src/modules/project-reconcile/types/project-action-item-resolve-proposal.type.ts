import { ProjectActionItemStatusSource, ProjectDocumentActionItemStatus } from "@prisma/client";

// what a run decided for one action item; returned so a dry run can be audited before anything is written
export type ProjectActionItemResolveProposal = {
  actionItemId: string;
  title: string;
  previousStatus: ProjectDocumentActionItemStatus;
  previousStatusSource: ProjectActionItemStatusSource;
  status: ProjectDocumentActionItemStatus;
  statusSource: ProjectActionItemStatusSource;
  resolvedByDocumentId: string | null;
  reason: string | null;
  evidenceQuote: string | null;
  confidence: number | null;
  conflicted: boolean;
  candidateCount: number;
};
