export type OpenAiTopicGroup = {
  // set when the members fold into an existing canonical topic; null when this is a new topic
  matchTopicId: string | null;
  name: string;
  type: string | null;
  summary: string;
  // the exact input topic names folded into this group
  memberNames: string[];
};
