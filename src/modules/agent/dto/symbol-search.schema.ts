import { SymbolType } from "@prisma/client";
import { z } from "zod";

export const SymbolSearchSchema = z.object({
  projectId: z
    .uuid()
    .optional()
    .describe("Project UUID to search within. Provide this OR gitRemoteUrl."),
  gitRemoteUrl: z
    .url()
    .optional()
    .describe("Git remote URL of an indexed repository. Used to auto-resolve projectId."),
  name: z.string().min(1).describe("Symbol name to search for. Case-insensitive substring match."),
  type: z
    .enum(Object.values(SymbolType) as [SymbolType, ...SymbolType[]])
    .optional()
    .describe(
      "Optional filter by symbol kind (function, class, interface, type, enum, variable, module, heading, term).",
    ),
});

export type SymbolSearchInput = z.infer<typeof SymbolSearchSchema>;
