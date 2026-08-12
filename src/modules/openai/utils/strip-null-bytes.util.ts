// postgres text columns cannot store null bytes (U+0000) - it strictly enforces UTF-8, and only bytea may hold them.
// models and binary-to-markdown conversion occasionally emit them, so sanitize untrusted text at the persistence boundary.
// removal (not a placeholder) is correct here because a null byte carries no meaning in extracted prose - it is pure noise.
const NULL_BYTE = String.fromCharCode(0);

export function stripNullBytes<T>(value: T): T {
  if (typeof value === "string") {
    return value.split(NULL_BYTE).join("") as T;
  }

  if (Array.isArray(value)) {
    return (value as unknown[]).map((item) => stripNullBytes(item)) as T;
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value)) {
      result[key] = stripNullBytes(item);
    }

    return result as T;
  }

  return value;
}
