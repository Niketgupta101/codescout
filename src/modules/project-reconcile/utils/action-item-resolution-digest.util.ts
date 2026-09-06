import { createHash } from "crypto";

// bump for any change that would make a stored verdict wrong: the prompt, the json schema, the distance threshold,
// the candidate limit, or how candidate text is built. a digest computed under an older version is discarded
export const RESOLUTION_JUDGMENT_VERSION = 1;

export type ActionItemResolutionDigestInput = {
  title: string;
  description: string;
  itemTime: Date;
  memberIds: string[];
  // one entry per candidate, "kind:id:contentHash". content is hashed rather than trusted by id because an id
  // alone cannot tell us the text behind it still says the same thing
  candidateEntries: string[];
};

/**
 * Fingerprints everything a resolution judgment depended on, so an unchanged evidence set can skip the LLM.
 * @param digestInput - the item, its members, and its candidate entries
 * @returns A hex digest that changes whenever the judgment could legitimately change.
 */
export const actionItemResolutionDigest = (digestInput: ActionItemResolutionDigestInput): string => {
  // statement updatedAt is deliberately NOT an input: threading rewrites validFrom/validUntil on every statement
  // in the project on every pass, which would invalidate every digest on every run and silently defeat the cache
  const payload = [
    `v=${RESOLUTION_JUDGMENT_VERSION}`,
    `item=${createHash("sha256").update(`${digestInput.title}\n${digestInput.description}`).digest("hex")}`,
    `time=${digestInput.itemTime.toISOString()}`,
    `members=${[...digestInput.memberIds].sort().join(",")}`,
    `candidates=${[...digestInput.candidateEntries].sort().join(",")}`,
  ].join("\n");

  return createHash("sha256").update(payload).digest("hex");
};
