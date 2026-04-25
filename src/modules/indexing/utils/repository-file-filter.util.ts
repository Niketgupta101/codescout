import type { FileFilterConfig } from "../../github/types/file-filter-config.type";

// shared file filter used by both indexRepository (real indexing) and IndexingCostService (cost estimate)
// keeping a single source of truth ensures the estimate exactly matches what real indexing will process
export const buildRepositoryIndexFileFilter = ({ includeTests }: { includeTests?: boolean }): FileFilterConfig => ({
  include: [
    "**/*.ts",
    "**/*.tsx",
    "**/*.js",
    "**/*.jsx",
    "**/*.json",
    "**/*.md",
    "**/*.markdown",
    "**/*.yml",
    "**/*.yaml",
    "**/*.prisma",
  ],
  exclude: [
    "node_modules/**",
    "dist/**",
    "build/**",
    "**/.git/**",
    "**/.vscode/**",
    "**/.gitignore",
    "**/.npmrc",
    "**/.nvmrc",
    "**/.env*",
    "**/.prettierrc*",
    "**/.eslintrc*",
    "**/.editorconfig",
    "**/package-lock.json",
    "**/yarn.lock",
    ...(includeTests ? [] : ["**/*.spec.ts", "**/*.test.ts"]),
  ],
  respectGitignore: true,
});
