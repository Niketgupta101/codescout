import * as micromatch from "micromatch";

export function filePathMatchesAnyPattern(filePath: string, patterns: string[]): boolean {
  return micromatch.isMatch(filePath, patterns);
}

export function shouldIncludeFile(filePath: string, includePatterns: string[], excludePatterns: string[]): boolean {
  // first check if excluded
  if (filePathMatchesAnyPattern(filePath, excludePatterns)) {
    return false;
  }

  // then check if included
  return filePathMatchesAnyPattern(filePath, includePatterns);
}
