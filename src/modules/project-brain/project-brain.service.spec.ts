import { ProjectBrainService } from "./project-brain.service";

describe(ProjectBrainService.name, () => {
  const projectId = "00000000-0000-0000-0000-000000000001";
  const documentId = "00000000-0000-0000-0000-000000000002";
  const statementId = "00000000-0000-0000-0000-000000000003";

  it("reads source lines around an extracted statement", async () => {
    const contentRaw = ["meeting title", "background", "the Soloplan tunnel is resolved", "next step"].join("\n");
    const prisma = {
      projectDocumentStatement: {
        findFirst: jest.fn().mockResolvedValue({
          id: statementId,
          projectDocumentId: documentId,
          textRaw: "the Soloplan tunnel is resolved",
          textDerived: "The Soloplan tunnel is resolved.",
        }),
      },
      projectDocument: {
        findFirst: jest.fn().mockResolvedValue({
          id: documentId,
          name: "meeting notes",
          path: "meeting-notes.md",
          type: "meetingNotes",
          occurredAt: new Date("2026-01-01T00:00:00.000Z"),
          contentRaw,
        }),
      },
    };
    const service = new ProjectBrainService(prisma as never, {} as never, {} as never);

    const result = await service.documentReadRange({ projectId, statementId });

    expect(result.range).toEqual({ startLine: 1, endLine: 4, truncated: false });
    expect(result.content).toContain("the Soloplan tunnel is resolved");
    expect(result.statement?.sourceTextLocated).toBe(true);
  });

  it("caps document ranges at 1500 lines", async () => {
    const contentRaw = Array.from({ length: 1502 }, (_, index) => `line ${index + 1}`).join("\n");
    const prisma = {
      projectDocumentStatement: { findFirst: jest.fn() },
      projectDocument: {
        findFirst: jest.fn().mockResolvedValue({
          id: documentId,
          name: "long notes",
          path: "long-notes.md",
          type: "meetingNotes",
          occurredAt: new Date("2026-01-01T00:00:00.000Z"),
          contentRaw,
        }),
      },
    };
    const service = new ProjectBrainService(prisma as never, {} as never, {} as never);

    const result = await service.documentReadRange({ projectId, documentId, startLine: 1, endLine: 1502 });

    expect(result.range).toEqual({ startLine: 1, endLine: 1500, truncated: true });
    expect(result.content).toContain("range capped at line 1500");
  });
});
