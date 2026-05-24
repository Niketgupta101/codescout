import { SymbolType } from "@prisma/client";
import { z } from "zod";

export const SymbolSearchSchema = z.object({
  projectId: z
    .uuid()
    .optional()
    .describe(
      "Project UUID to search within. Provide projectId OR gitRemoteUrl to scope to one project; omit BOTH for cross-project discovery across every project you can read.",
    ),
  gitRemoteUrl: z
    .url()
    .optional()
    .describe("Git remote URL of an indexed repository. Used to auto-resolve projectId."),
  name: z.string().min(1).describe("Symbol name to search for. Case-insensitive substring match."),
  type: z
    .enum(Object.values(SymbolType) as [SymbolType, ...SymbolType[]])
    .optional()
    .describe(
      "Optional filter by symbol kind (function, class, interface, type, enum; heading/term used for CSV domain rows only).",
    ),
  pathPattern: z
    .string()
    .optional()
    .describe(
      "Optional case-insensitive substring matched against the full file path to limit the search scope " +
        "(e.g. 'order.service', 'modules/auth'). Use when the same symbol name exists in many files.",
    ),
});

export type SymbolSearchInput = z.infer<typeof SymbolSearchSchema>;
