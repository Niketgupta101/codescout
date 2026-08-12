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

// MIME types that the ingestion pipeline can normalize before handing content to markitdown.
// Google Workspace files are exported to one of the supported extensions first.
export const MARKITDOWN_SUPPORTED_MIME_TYPES = [
  "text/markdown",
  "text/plain",
  "text/csv",
  "text/html",
  "application/xhtml+xml",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
  "application/vnd.google-apps.drawing",
];
