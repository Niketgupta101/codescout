import { ProjectDocumentActionItemStatus } from "@prisma/client";

export type ActionItemStatusMember = {
  status: ProjectDocumentActionItemStatus;
  projectDocument: { occurredAt: Date };
};

// lapsed sits last: a same-day cancellation alongside a completion is contradictory, and claiming the work was
// abandoned is the more damaging of the two to get wrong
const STATUS_PRECEDENCE: ProjectDocumentActionItemStatus[] = [
  ProjectDocumentActionItemStatus.done,
  ProjectDocumentActionItemStatus.inProgress,
  ProjectDocumentActionItemStatus.blocked,
  ProjectDocumentActionItemStatus.open,
  ProjectDocumentActionItemStatus.lapsed,
];

/**
 * Aggregates a canonical action item's member (extraction-time) statuses into a base status, newest document wins.
 * Members carry no ordering of their own, so a later document restating an item as open is real evidence it
 * reopened, and a revised tracker marking a row cancelled must outrank the same row's earlier completed.
 * Members sharing the newest date have no temporal order between them, so precedence decides among those.
 * @param members - the item's non-suppressed members, each with its source document's event date
 * @returns The status the most recent evidence supports.
 */
export const aggregateMemberStatus = (members: ActionItemStatusMember[]): ProjectDocumentActionItemStatus => {
  if (members.length === 0) {
    return ProjectDocumentActionItemStatus.open;
  }

  const newestTime = members.reduce(
    (latest, member) => Math.max(latest, member.projectDocument.occurredAt.getTime()),
    Number.NEGATIVE_INFINITY,
  );
  const newestStatuses = members
    .filter((member) => member.projectDocument.occurredAt.getTime() === newestTime)
    .map((member) => member.status);

  return STATUS_PRECEDENCE.find((status) => newestStatuses.includes(status)) ?? ProjectDocumentActionItemStatus.open;
};
