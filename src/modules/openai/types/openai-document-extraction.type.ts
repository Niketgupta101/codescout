// structured knowledge extracted from one document; topics are referenced by name and resolved to ids on persist
export type OpenAiDocumentExtraction = {
  topics: { name: string }[];
  statements: {
    topicName: string;
    textRaw: string;
    textDerived: string;
    type: string;
    decisionStatus: string | null;
    implementationStatus: string | null;
    optionTopicName: string | null;
    reason: string | null;
    replacesPriorStatementText: string | null;
    actor: string | null;
    // inferred event date (ISO) for this statement; null when it has no date of its own
    occurredAt: string | null;
  }[];
  actionItems: {
    topicName: string | null;
    // null when the source records the work without naming who is accountable, as a task list or tracker row does
    owner: string | null;
    description: string;
    expectedBy: string | null;
    status: string;
    blockedOn: string | null;
    reason: string | null;
    textRaw: string;
  }[];
  references: {
    topicName: string | null;
    referentText: string;
    expectation: string;
    textRaw: string;
  }[];
};
