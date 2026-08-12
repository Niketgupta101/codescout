import { OpenAiDocumentExtraction } from "../../openai/types/openai-document-extraction.type";

const normalize = (value: string) =>
  value
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const startsWithUnresolvedReferent = (value: string) => /^(it|this|that|these|those|they|he|she)\b/i.test(value.trim());

const hasVagueObject = (value: string) =>
  /\b(send|share|review|update|check|test|provide|forward|analyze|analyse|discuss|obtain|pull)\s+(the|this|that|these|those)\s+(document|file|data|points?|thing|stuff|items?|changes?)\b/i.test(
    value,
  ) ||
  /\bfollow up (?:on|with)\s+(the|this|that|these|those)\s+(document|file|data|points?|thing|stuff|items?|changes?)\b/i.test(
    value,
  );

const isMeetingLogistics = (value: string) =>
  /\b(?:call|meeting|sync|catch-?up)\b.*\b(?:scheduled|rescheduled|meet|in\s+\d+\s+(?:minutes?|hours?|days?|weeks?))\b/i.test(
    value,
  ) || /\b(?:meet|meeting)\s+in\s+\d+\s+(?:days?|weeks?)\b/i.test(value);

const isPersonalCommitment = (value: string) =>
  /\b(?:will|shall|committed to|is assigned to|is responsible for)\b/i.test(value);

const isOwnerSupportedByEvidence = (owner: string, textRaw: string) => {
  const normalizedEvidence = normalize(textRaw);
  const owners = owner.split(/\s+(?:and|&|und)\s+|\s*,\s*/i).filter(Boolean);
  return owners.every((candidate) => normalizedEvidence.includes(normalize(candidate)));
};

export const filterRetrievalReadyStatements = <T extends OpenAiDocumentExtraction["statements"][number]>(
  statements: T[],
): T[] => {
  const seen = new Set<string>();

  return statements.filter((statement) => {
    const normalized = normalize(statement.textDerived);
    if (
      !normalized ||
      !statement.textRaw.trim() ||
      startsWithUnresolvedReferent(statement.textDerived) ||
      isMeetingLogistics(statement.textDerived)
    ) {
      return false;
    }

    if (seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
};

export const filterStatementsDuplicatedByActions = <
  TStatement extends OpenAiDocumentExtraction["statements"][number],
  TAction extends OpenAiDocumentExtraction["actionItems"][number],
>(
  statements: TStatement[],
  actionItems: TAction[],
): TStatement[] => {
  const actionEvidence = new Set(actionItems.map((actionItem) => normalize(actionItem.textRaw)));
  return statements.filter(
    (statement) =>
      !(
        statement.actor &&
        isPersonalCommitment(statement.textDerived) &&
        actionEvidence.has(normalize(statement.textRaw))
      ),
  );
};

export const filterRetrievalReadyActionItems = <T extends OpenAiDocumentExtraction["actionItems"][number]>(
  actionItems: T[],
): T[] => {
  const seen = new Set<string>();

  return actionItems.filter((actionItem) => {
    const owner = actionItem.owner.trim();
    const description = normalize(actionItem.description);
    if (
      !owner ||
      !description ||
      !actionItem.textRaw.trim() ||
      /^(the group|group|the team|team|someone|unknown|unassigned|tbd|n\/a)$/i.test(owner) ||
      !isOwnerSupportedByEvidence(owner, actionItem.textRaw) ||
      startsWithUnresolvedReferent(actionItem.description) ||
      hasVagueObject(actionItem.description)
    ) {
      return false;
    }

    const key = `${normalize(owner)}:${description}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};
