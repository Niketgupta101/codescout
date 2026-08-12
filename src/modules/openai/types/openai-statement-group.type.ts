export type OpenAiStatementGroup = {
  name: string;
  type: string | null;
  // indices into the input statements array that belong to this topic
  memberIndices: number[];
};
