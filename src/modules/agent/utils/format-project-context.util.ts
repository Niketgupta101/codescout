import { AgentFormatProjectContextOptions } from "../types/agent-format-project-context-options.type";

const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_MAX_DIRECTORY_ENTRIES = 50;

// renders the project + directory hierarchy as a system-prompt prefix so the agent starts oriented without tool calls
// returns an empty string when nothing has been summarized yet (e.g. project indexed before this feature shipped)
export const formatProjectContextSection = ({
  projectName,
  projectSummary,
  directories,
  maxDepth = DEFAULT_MAX_DEPTH,
  maxDirectoryEntries = DEFAULT_MAX_DIRECTORY_ENTRIES,
}: AgentFormatProjectContextOptions): string => {
  // nothing summarized yet — fall back to the baseline prompt rather than emitting a useless empty header
  if (!projectSummary && directories.length === 0) {
    return "";
  }

  const sections: string[] = [`PROJECT: ${projectName}`];

  if (projectSummary) {
    sections.push("", projectSummary);
  }

  const directoriesInBudget = directories
    .filter((directory) => directory.depth <= maxDepth && directory.summary !== null)
    .slice(0, maxDirectoryEntries);

  if (directoriesInBudget.length > 0) {
    sections.push("", "STRUCTURE:");

    for (const directory of directoriesInBudget) {
      // indent reflects the directory's depth so the agent can read the hierarchy at a glance
      const indent = "  ".repeat(Math.max(0, directory.depth - 1));

      // last segment is friendlier than fullPath in the rendered tree; depth indent already conveys hierarchy
      const lastSegment = directory.fullPath.split("/").pop() ?? directory.fullPath;

      sections.push(`${indent}- ${lastSegment}/: ${directory.summary}`);
    }
  }

  // trailing blank line separates this block from the rest of the system prompt
  return sections.join("\n") + "\n\n";
};
