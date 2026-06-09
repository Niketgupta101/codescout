import * as path from "path";
import { NextJsFileMetadata, NextJsFileRole, NextJsRuntime } from "../types/nextjs-file-metadata.type";

// app-router role files: when found under app/, the basename maps to the role
// pages-router uses different conventions handled inline below
const APP_ROUTER_ROLE_BY_BASENAME: Record<string, NextJsFileRole> = {
  page: "page",
  layout: "layout",
  route: "route",
  loading: "loading",
  error: "error",
  "not-found": "not-found",
  template: "template",
  default: "default",
};

// directives must appear at the top of the file; we tolerate up to this many leading lines so jsdoc banners and license headers don't suppress detection
const RUNTIME_DIRECTIVE_LINE_BUDGET = 20;

// looks at the file's path and content and returns next.js role + runtime if they apply
// safe to call on any indexed file - non-next.js files just return an empty object
export const detectNextJsFileMetadata = ({
  fullPath,
  rawContent,
}: {
  fullPath: string;
  rawContent: string;
}): NextJsFileMetadata => {
  const metadata: NextJsFileMetadata = {};

  const role = _detectRoleFromPath(fullPath);
  if (role) {
    metadata.nextjsRole = role;
  }

  const runtime = _detectRuntimeFromContent(rawContent);
  if (runtime) {
    metadata.runtime = runtime;
  }

  return metadata;
};

const _detectRoleFromPath = (fullPath: string): NextJsFileRole | undefined => {
  // restrict to typescript / javascript source files; route.ts is allowed alongside page.tsx
  if (!/\.(ts|tsx|js|jsx)$/i.test(fullPath)) {
    return undefined;
  }

  const fileBasenameWithoutExtension = path.basename(fullPath, path.extname(fullPath)).toLowerCase();
  const segments = fullPath.split("/").filter(Boolean);

  // root-level middleware.ts (or under a src/ wrapper) - not under app/ or pages/
  // accept any depth as long as no app/ or pages/ segment dominates the path
  if (fileBasenameWithoutExtension === "middleware" && !segments.includes("app") && !segments.includes("pages")) {
    return "middleware";
  }

  const lastAppIndex = segments.lastIndexOf("app");
  const lastPagesIndex = segments.lastIndexOf("pages");

  // app router: file lives under an app/ segment and its basename matches a known role
  if (lastAppIndex !== -1 && lastAppIndex < segments.length - 1) {
    const role = APP_ROUTER_ROLE_BY_BASENAME[fileBasenameWithoutExtension];
    if (role) {
      return role;
    }
  }

  // pages router
  if (lastPagesIndex !== -1 && lastPagesIndex < segments.length - 1) {
    // pages/api/** are http handlers, not page components
    if (segments[lastPagesIndex + 1] === "api") {
      return "route";
    }

    // _app and _document are framework hooks, not user-facing pages - skip them so the role stays meaningful
    if (fileBasenameWithoutExtension === "_app" || fileBasenameWithoutExtension === "_document") {
      return undefined;
    }

    // anything else under pages/ is a route component
    return "page";
  }

  return undefined;
};

const _detectRuntimeFromContent = (rawContent: string): NextJsRuntime | undefined => {
  // only inspect the head of the file: a runtime directive that appears later than this is invalid per the next.js spec anyway
  const head = rawContent.split("\n").slice(0, RUNTIME_DIRECTIVE_LINE_BUDGET).join("\n");

  // the directive is a bare string literal on its own line, optionally followed by a semicolon
  // anchoring with ^...$ in multiline mode rejects matches inside comments or strings
  if (/^\s*["']use client["']\s*;?\s*$/m.test(head)) {
    return "client";
  }

  if (/^\s*["']use server["']\s*;?\s*$/m.test(head)) {
    return "server";
  }

  return undefined;
};
