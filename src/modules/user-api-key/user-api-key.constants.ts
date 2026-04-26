// brand prefix on every issued key — used by McpActorService to distinguish API keys from JWTs in the Authorization header
export const USER_API_KEY_PREFIX = "cck_";

// number of secret chars stored as the indexed lookup handle
// also what's shown in UI listings so users can identify which key they're looking at
export const USER_API_KEY_LOOKUP_PREFIX_LENGTH = 8;

// 32 bytes of randomness — base64url encoded becomes ~43 chars after the brand prefix
export const USER_API_KEY_SECRET_BYTES = 32;
