import { filterRetrievalReadyActionItems } from "./extraction-quality.util";

const actionItem = (overrides: { owner: string | null; description: string; textRaw: string }) => ({
  topicName: null,
  expectedBy: null,
  status: "open",
  blockedOn: null,
  reason: null,
  ...overrides,
});

describe("filterRetrievalReadyActionItems", () => {
  it("keeps an item whose source tracks it without naming an owner", () => {
    const kept = filterRetrievalReadyActionItems([
      actionItem({
        owner: null,
        description: "Migrate the customer export to the new Soloplan endpoint.",
        textRaw: "| Migrate customer export to new Soloplan endpoint | Completed |",
      }),
    ]);

    expect(kept).toHaveLength(1);
    expect(kept[0].owner).toBeNull();
  });

  it("nulls an inferred collective owner instead of dropping the item", () => {
    const kept = filterRetrievalReadyActionItems([
      actionItem({
        owner: "The group",
        description: "Migrate the customer export to the new Soloplan endpoint.",
        textRaw: "The group will migrate the customer export to the new Soloplan endpoint.",
      }),
    ]);

    expect(kept).toHaveLength(1);
    expect(kept[0].owner).toBeNull();
  });

  it("nulls an owner the evidence does not establish, since that owner was fabricated", () => {
    const kept = filterRetrievalReadyActionItems([
      actionItem({
        owner: "Marc Müller",
        description: "Migrate the customer export to the new Soloplan endpoint.",
        textRaw: "Someone needs to migrate the customer export to the new Soloplan endpoint.",
      }),
    ]);

    expect(kept).toHaveLength(1);
    expect(kept[0].owner).toBeNull();
  });

  it("keeps an owner the evidence does establish", () => {
    const kept = filterRetrievalReadyActionItems([
      actionItem({
        owner: "Marc Müller",
        description: "Migrate the customer export to the new Soloplan endpoint.",
        textRaw: "Marc Müller will migrate the customer export to the new Soloplan endpoint.",
      }),
    ]);

    expect(kept[0].owner).toBe("Marc Müller");
  });

  it("still drops vague and context-dependent descriptions", () => {
    const kept = filterRetrievalReadyActionItems([
      actionItem({ owner: null, description: "Send the document", textRaw: "Send the document" }),
      actionItem({ owner: null, description: "It needs updating", textRaw: "It needs updating" }),
    ]);

    expect(kept).toHaveLength(0);
  });

  it("deduplicates owner-less items sharing a description", () => {
    const kept = filterRetrievalReadyActionItems([
      actionItem({
        owner: null,
        description: "Migrate the customer export to the new Soloplan endpoint.",
        textRaw: "| Migrate customer export | Completed |",
      }),
      actionItem({
        owner: null,
        description: "Migrate the customer export to the new Soloplan endpoint.",
        textRaw: "| Migrate customer export | In progress |",
      }),
    ]);

    expect(kept).toHaveLength(1);
  });
});
