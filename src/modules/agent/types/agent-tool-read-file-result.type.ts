export type AgentToolReadFileResult = {
  path: string;
  language: string;
  content: string;
  metadata: unknown;
  // total line count of the underlying file in storage
  totalLines: number;
  // inclusive 1-indexed line range actually returned in `content`
  returnedLineRange: { start: number; end: number };
  // true when content was clipped (whole-file read past the line cap, or range read that exceeded the cap)
  truncated: boolean;
};
