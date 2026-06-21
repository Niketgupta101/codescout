// extensions markitdown converts into markdown for ingestion; anything else is skipped/quarantined by the caller
// (video, audio, images and junk are intentionally absent - re-add when we have a converter/use for them)
export const MARKITDOWN_SUPPORTED_EXTENSIONS = [
  ".md",
  ".markdown",
  ".txt",
  ".text",
  ".csv",
  ".html",
  ".htm",
  ".docx",
  ".pdf",
  ".xlsx",
];
