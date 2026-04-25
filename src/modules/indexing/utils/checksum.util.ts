import { createHash } from "crypto";

export const calculateChecksum = (content: string): string => {
  return createHash("sha256").update(content, "utf8").digest("hex");
};

export const hasContentChanged = (oldChecksum: string | null, newChecksum: string): boolean => {
  return oldChecksum !== newChecksum;
};
