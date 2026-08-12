// outcome of reconciling a project's relational layer
export type ProjectReconcileResult = {
  projectId: string;
  // human corrections re-applied onto the current ai rows this run
  correctionsApplied: number;
  // new canonical topics created this run
  topicsCreated: number;
  // existing canonical topics that absorbed at least one doc-topic this run
  topicsMatched: number;
  // statements whose bi-temporal validity was recomputed
  statementsReconciled: number;
  // supersession links established this run
  supersessionsLinked: number;
  // new canonical action items created this run
  actionItemsCreated: number;
  // existing canonical action items that absorbed at least one doc-level item this run
  actionItemsMatched: number;
  // references linked or contradicted against a document/statement this run (not left notFound)
  referencesResolved: number;
  // canonical action items whose status was set from a document or code signal this run
  actionItemsResolved: number;
};
