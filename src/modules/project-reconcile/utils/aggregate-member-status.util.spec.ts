import { ProjectDocumentActionItemStatus } from "@prisma/client";
import { aggregateMemberStatus } from "./aggregate-member-status.util";

const member = (status: ProjectDocumentActionItemStatus, occurredAt: string) => ({
  status,
  projectDocument: { occurredAt: new Date(occurredAt) },
});

describe("aggregateMemberStatus", () => {
  it("takes the newest member's status rather than the most advanced one", () => {
    const status = aggregateMemberStatus([
      member(ProjectDocumentActionItemStatus.done, "2026-04-10T00:00:00.000Z"),
      member(ProjectDocumentActionItemStatus.open, "2026-06-14T00:00:00.000Z"),
    ]);

    expect(status).toBe(ProjectDocumentActionItemStatus.open);
  });

  it("lets a later cancellation outrank an earlier completion", () => {
    const status = aggregateMemberStatus([
      member(ProjectDocumentActionItemStatus.done, "2026-04-10T00:00:00.000Z"),
      member(ProjectDocumentActionItemStatus.lapsed, "2026-06-14T00:00:00.000Z"),
    ]);

    expect(status).toBe(ProjectDocumentActionItemStatus.lapsed);
  });

  it("is unaffected by the order members arrive in", () => {
    const members = [
      member(ProjectDocumentActionItemStatus.open, "2026-06-14T00:00:00.000Z"),
      member(ProjectDocumentActionItemStatus.done, "2026-04-10T00:00:00.000Z"),
    ];

    expect(aggregateMemberStatus(members)).toBe(aggregateMemberStatus([...members].reverse()));
  });

  it("falls back to precedence among members sharing the newest date", () => {
    const status = aggregateMemberStatus([
      member(ProjectDocumentActionItemStatus.open, "2026-06-14T00:00:00.000Z"),
      member(ProjectDocumentActionItemStatus.done, "2026-06-14T00:00:00.000Z"),
    ]);

    expect(status).toBe(ProjectDocumentActionItemStatus.done);
  });

  it("keeps a lapsed status when every member on the newest date agrees", () => {
    const status = aggregateMemberStatus([
      member(ProjectDocumentActionItemStatus.lapsed, "2026-06-14T00:00:00.000Z"),
      member(ProjectDocumentActionItemStatus.lapsed, "2026-06-14T00:00:00.000Z"),
    ]);

    expect(status).toBe(ProjectDocumentActionItemStatus.lapsed);
  });

  it("returns open for an item with no members", () => {
    expect(aggregateMemberStatus([])).toBe(ProjectDocumentActionItemStatus.open);
  });
});
