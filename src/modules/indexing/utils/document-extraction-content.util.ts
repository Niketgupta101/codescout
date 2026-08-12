const TRANSCRIPT_HEADING = /^#{1,6}\s+.*\b(?:transcript|transcription|transkript)\b.*$/gimu;
const CURATED_SECTION_HEADING =
  /^#{1,6}\s+.*\b(?:summary|zusammenfassung|details|notes|notizen|next steps|action items|nächste schritte|entscheidungen|decisions)\b.*$/imu;
const TIMESTAMPED_TRANSCRIPT_CONTENT =
  /^(?:#{1,6}\s+)?(?:\[)?(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?:\])?(?:\s|$)/mu;
const SUMMARY_HEADING = /^(?:summary|executive summary|zusammenfassung|overview)$/iu;
const ACTION_HEADING =
  /^(?:recommended next steps|next steps|action items|nächste schritte|empfohlene nächste schritte|maßnahmen)$/iu;

const extractMarkdownSection = (content: string, headingPattern: RegExp): string | null => {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    return !!match && headingPattern.test(match[2]);
  });
  if (start < 0) return null;

  const level = /^(#{1,6})\s+/.exec(lines[start])![1].length;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    const heading = /^(#{1,6})\s+/.exec(lines[index]);
    if (heading && heading[1].length <= level) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trim();
};

/**
 * Meeting exports in Google Docs, Word, PDF, and other formats may contain curated notes followed by the full
 * timestamped transcript. Feeding both to extraction duplicates knowledge and lets transcript tangents overwhelm
 * project facts. Detection is based on content structure rather than document classification because classification
 * may be missing or inaccurate. The complete contentRaw remains stored for provenance.
 */
export function selectKnowledgeExtractionContent(content: string): string {
  for (const transcriptHeading of content.matchAll(TRANSCRIPT_HEADING)) {
    if (transcriptHeading.index === 0) continue;

    const curatedNotes = content.slice(0, transcriptHeading.index).trim();
    const transcript = content.slice(transcriptHeading.index + transcriptHeading[0].length);

    // Avoid deleting a relevant prose appendix merely because its heading contains the word "transcript".
    if (CURATED_SECTION_HEADING.test(curatedNotes) && TIMESTAMPED_TRANSCRIPT_CONTENT.test(transcript)) {
      return curatedNotes;
    }
  }

  return content;
}

export function selectDocumentExtractionContents(content: string): {
  statementContent: string;
  actionContent: string;
  usedCuratedSections: boolean;
} {
  const curatedNotes = selectKnowledgeExtractionContent(content);
  const isBundledTranscript = curatedNotes.length < content.length;
  if (!isBundledTranscript) {
    return { statementContent: curatedNotes, actionContent: curatedNotes, usedCuratedSections: false };
  }

  const summary = extractMarkdownSection(curatedNotes, SUMMARY_HEADING);
  const nextSteps = extractMarkdownSection(curatedNotes, ACTION_HEADING);
  if (!summary || !nextSteps) {
    return { statementContent: curatedNotes, actionContent: curatedNotes, usedCuratedSections: false };
  }

  const title = curatedNotes.split(/\r?\n/).find((line) => /^#{1,2}\s+\S/.test(line));
  const withTitle = (section: string) => (title && !section.startsWith(title) ? `${title}\n${section}` : section);
  const knowledgeNotes = curatedNotes.replace(nextSteps, "").replace(/\n{3,}/g, "\n\n").trim();
  return {
    statementContent: knowledgeNotes,
    actionContent: withTitle(nextSteps),
    usedCuratedSections: true,
  };
}
