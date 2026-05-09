// roles a next.js file can play in either app router (page/layout/route/loading/...) or pages router
// stamped on CodeFile.metadata so overview-type queries ("what pages does this app have?") can filter without re-parsing
export type NextJsFileRole =
  | "page"
  | "layout"
  | "route"
  | "loading"
  | "error"
  | "not-found"
  | "template"
  | "default"
  | "middleware";

// runtime declared by a "use client" / "use server" directive at the top of the file
// undefined means no directive present (server component by default in app router; in pages router this distinction doesn't apply)
export type NextJsRuntime = "client" | "server";

export type NextJsFileMetadata = {
  nextjsRole?: NextJsFileRole;
  runtime?: NextJsRuntime;
};
