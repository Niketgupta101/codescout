import type { ProjectActionItemResolveProposal } from "./project-action-item-resolve-proposal.type";

export type ProjectActionItemResolveResult = {
  actionItemsExamined: number;
  // items whose evidence changed since the last run, so an llm judgment was actually made
  actionItemsJudged: number;
  actionItemsSkipped: number;
  actionItemsResolved: number;
  // previously resolved items whose evidence no longer resolves them, returned to the extracted aggregate
  actionItemsReverted: number;
  actionItemsConflicted: number;
  quoteRejections: number;
  proposals: ProjectActionItemResolveProposal[];
};
