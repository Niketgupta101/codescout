export function projectDocumentParseOccurredAt(parseOccurredAtInput: { text: string; fallback: Date }): Date {
  const { text, fallback } = parseOccurredAtInput;

  // matches an embedded date like 2026-05-22 / 2026_05_22 / 2026.05.22 / 2026/05/22
  const match = /(\d{4})[-_./](\d{2})[-_./](\d{2})/.exec(text);

  if (!match) {
    return fallback;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // reject version-like noise (e.g. "v2026_13_99") so it doesn't roll over into a bogus date
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return fallback;
  }

  return new Date(year, month - 1, day);
}
