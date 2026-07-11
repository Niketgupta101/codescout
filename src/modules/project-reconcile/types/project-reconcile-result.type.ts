// outcome of reconciling a project's relational layer
export type ProjectReconcileResult = {
  projectId: string;
  // new canonical topics created this run
  topicsCreated: number;
  // existing canonical topics that absorbed at least one doc-topic this run
  topicsMatched: number;
  // statements whose bi-temporal validity was recomputed
  statementsReconciled: number;
  // supersession links established this run
  supersessionsLinked: number;
};
