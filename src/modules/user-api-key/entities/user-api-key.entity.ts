import { UserApiKey } from "@prisma/client";
import { Expose } from "class-transformer";

@Expose()
export class UserApiKeyEntity implements Omit<UserApiKey, "keyHash" | "userId"> {
  id: string;
  name: string;
  // only the indexed prefix is exposed (e.g. "a1b2c3d4") — the full key value is never returned after creation
  prefix: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}
