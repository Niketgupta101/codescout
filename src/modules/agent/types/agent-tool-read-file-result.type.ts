export type AgentToolReadFileResult = {
  path: string;
  language: string;
  content: string;
  metadata: unknown;
  // total line count of the underlying file in storage
  totalLines: number;
};
