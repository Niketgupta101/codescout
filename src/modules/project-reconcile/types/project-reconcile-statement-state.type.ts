import type { ProjectDocumentDecisionStatus, ProjectDocumentImplementationStatus } from "@prisma/client";

// the fully-computed relational state for one statement, held in memory until applied atomically
export type ProjectReconcileStatementState = {
  validFrom: Date;
  validUntil: Date | null;
  decisionStatus: ProjectDocumentDecisionStatus | null;
  implementationStatus: ProjectDocumentImplementationStatus | null;
  replacesPriorStatementId: string | null;
  replacedByStatementId: string | null;
};
