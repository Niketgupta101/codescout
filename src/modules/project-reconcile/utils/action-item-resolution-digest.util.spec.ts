import { readFileSync } from "fs";
import { join } from "path";
import { actionItemResolutionDigest } from "./action-item-resolution-digest.util";

const baseInput = () => ({
  title: "Sign the contract and Pflichtenheft",
  description: "Sign the contract together with the requirements specification.",
  itemTime: new Date("2025-09-10T00:00:00.000Z"),
  memberIds: ["member-b", "member-a"],
  candidateEntries: ["document:stmt-2:hash-2", "document:stmt-1:hash-1"],
});

describe("actionItemResolutionDigest", () => {
  it("is stable when candidates and members arrive in a different order", () => {
    const first = actionItemResolutionDigest(baseInput());
    const second = actionItemResolutionDigest({
      ...baseInput(),
      memberIds: ["member-a", "member-b"],
      candidateEntries: ["document:stmt-1:hash-1", "document:stmt-2:hash-2"],
    });

    expect(first).toBe(second);
  });

  it("changes when a candidate's content changes but its id does not", () => {
    const changed = actionItemResolutionDigest({
      ...baseInput(),
      candidateEntries: ["document:stmt-2:hash-2", "document:stmt-1:hash-CHANGED"],
    });

    expect(changed).not.toBe(actionItemResolutionDigest(baseInput()));
  });

  it("changes when a member is added, even one older than itemTime", () => {
    const changed = actionItemResolutionDigest({ ...baseInput(), memberIds: ["member-a", "member-b", "member-c"] });

    expect(changed).not.toBe(actionItemResolutionDigest(baseInput()));
  });

  it("changes when canonicalization rewrites the title or description", () => {
    expect(actionItemResolutionDigest({ ...baseInput(), title: "Sign the contract" })).not.toBe(
      actionItemResolutionDigest(baseInput()),
    );
  });

  it("changes when itemTime moves", () => {
    expect(
      actionItemResolutionDigest({ ...baseInput(), itemTime: new Date("2025-10-15T00:00:00.000Z") }),
    ).not.toBe(actionItemResolutionDigest(baseInput()));
  });

  // regression guard: threading rewrites every statement on every pass, so keying the digest on statement
  // updatedAt would invalidate the whole cache every run and silently defeat it
  it("does not read statement updatedAt", () => {
    const source = readFileSync(join(__dirname, "action-item-resolution-digest.util.ts"), "utf-8");
    const executable = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");

    expect(executable).not.toContain("updatedAt");
  });
});
