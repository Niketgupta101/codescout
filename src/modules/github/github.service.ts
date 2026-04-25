import { Injectable, Logger } from "@nestjs/common";
import { simpleGit, SimpleGit, SimpleGitOptions } from "simple-git";
import * as fs from "fs/promises";
import * as path from "path";
import ignore from "ignore";
import { filePathMatchesAnyPattern } from "../../utils/glob-matcher.util";
import type { CloneOptions } from "./types/clone-options.type";
import type { FileFilterConfig } from "./types/file-filter-config.type";
import type { CodeFile } from "./types/code-file.type";

@Injectable()
export class GithubService {
  readonly logger = new Logger(GithubService.name);
  readonly cloneBasePath: string;

  constructor() {
    // store cloned repos in temp directory
    this.cloneBasePath = path.join(process.cwd(), ".temp", "repos");
  }

  async cloneRepo({ url, branch = "main", depth = 1, authToken }: CloneOptions): Promise<string> {
    const repoName = this._extractRepoName(url);
    const timestamp = Date.now();
    const clonePath = path.join(this.cloneBasePath, `${repoName}_${timestamp}`);

    this.logger.log(`Cloning repository: ${url} (branch: ${branch})`);

    try {
      // ensure base directory exists
      await fs.mkdir(this.cloneBasePath, { recursive: true });

      // configure git options
      const gitOptions: Partial<SimpleGitOptions> = {
        baseDir: this.cloneBasePath,
        binary: "git",
        maxConcurrentProcesses: 6,
      };

      const git: SimpleGit = simpleGit(gitOptions);

      // add auth token to url if provided
      const cloneUrl = authToken ? this._addAuthToUrl(url, authToken) : url;

      // clone repository
      await git.clone(cloneUrl, clonePath, ["--branch", branch, "--depth", depth.toString(), "--single-branch"]);

      this.logger.log(`Successfully cloned to: ${clonePath}`);

      return clonePath;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to clone repository: ${errorMessage}`);
      throw error;
    }
  }

  async getLatestCommitHash(repoPath: string): Promise<string> {
    try {
      const git: SimpleGit = simpleGit(repoPath);
      const log = await git.log({ maxCount: 1 });
      return log.latest?.hash ?? "";
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get commit hash: ${errorMessage}`);
      throw error;
    }
  }

  async listCodeFiles(repoPath: string, filterConfig: FileFilterConfig = {}): Promise<CodeFile[]> {
    const {
      include = ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.json", "**/*.md", "**/*.markdown"],
      exclude = ["node_modules/**", "dist/**", "build/**", "**/*.spec.ts", "**/*.test.ts"],
      respectGitignore = true,
    } = filterConfig;

    this.logger.log(`Listing code files in: ${repoPath}`);
    this.logger.debug(`Include patterns: ${JSON.stringify(include.slice(0, 5))}${include.length > 5 ? "..." : ""}`);
    this.logger.debug(`Exclude patterns: ${JSON.stringify(exclude.slice(0, 5))}${exclude.length > 5 ? "..." : ""}`);

    try {
      // load .gitignore if needed
      let gitignoreFilter: ReturnType<typeof ignore> | null = null;
      if (respectGitignore) {
        gitignoreFilter = await this._loadGitignore(repoPath);
        if (gitignoreFilter) {
          this.logger.debug("Loaded .gitignore patterns");
        }
      }

      // recursively walk directory
      const files = await this._walkDirectory(repoPath, repoPath, include, exclude, gitignoreFilter);

      this.logger.log(`Found ${files.length} code files in ${repoPath}`);
      return files;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to list code files: ${errorMessage}`);
      throw error;
    }
  }

  async cleanup(repoPath: string): Promise<void> {
    try {
      await fs.rm(repoPath, { recursive: true, force: true });
      this.logger.log(`Cleaned up: ${repoPath}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Cleanup failed: ${errorMessage}`);
    }
  }

  // extract from: https://github.com/org/repo.git or git@github.com:org/repo.git
  _extractRepoName(url: string): string {
    const match = url.match(/\/([^/]+?)(?:\.git)?$/);
    return match ? match[1] : "unknown";
  }

  _addAuthToUrl(url: string, token: string): string {
    if (url.startsWith("https://")) {
      return url.replace("https://", `https://${token}@`);
    }
    return url;
  }

  async _loadGitignore(repoPath: string): Promise<ReturnType<typeof ignore> | null> {
    const gitignorePath = path.join(repoPath, ".gitignore");

    try {
      const content = await fs.readFile(gitignorePath, "utf-8");
      const ig = ignore();
      ig.add(content);
      return ig;
    } catch {
      // .gitignore not found or not readable
      return null;
    }
  }

  async _walkDirectory(
    rootPath: string,
    currentPath: string,
    include: string[],
    exclude: string[],
    gitignoreFilter: ReturnType<typeof ignore> | null,
  ): Promise<CodeFile[]> {
    const files: CodeFile[] = [];

    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      const depth = currentPath.replace(rootPath, "").split(path.sep).length - 1;
      this.logger.debug(
        `Walking: ${path.relative(rootPath, currentPath) || "."} (${entries.length} entries, depth: ${depth})`,
      );

      for (const entry of entries) {
        const absolutePath = path.join(currentPath, entry.name);
        const relativePath = path.relative(rootPath, absolutePath);

        if (entry.isDirectory()) {
          // skip common excluded directories by name
          if (
            entry.name === ".git" ||
            entry.name === "node_modules" ||
            entry.name === "dist" ||
            entry.name === "build"
          ) {
            this.logger.debug(`Skipping excluded directory: ${relativePath}`);
            continue;
          }

          // recurse into directory (always recurse, don't apply file filters to directories)
          const subFiles = await this._walkDirectory(rootPath, absolutePath, include, exclude, gitignoreFilter);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          // skip if in exclude patterns (files only)
          if (filePathMatchesAnyPattern(relativePath, exclude)) {
            this.logger.debug(`Excluded by pattern: ${relativePath}`);
            continue;
          }

          // skip if in .gitignore (files only)
          if (gitignoreFilter?.ignores(relativePath)) {
            this.logger.debug(`Excluded by .gitignore: ${relativePath}`);
            continue;
          }

          // check if matches include patterns
          if (!filePathMatchesAnyPattern(relativePath, include)) {
            this.logger.debug(`Not in include patterns: ${relativePath}`);
            continue;
          }

          // check file size limits
          const stats = await fs.stat(absolutePath);
          const fileSize = stats.size;

          // skip files that are too small (likely empty or noise)
          if (fileSize < 10) {
            this.logger.debug(`Skipping tiny file (${fileSize} bytes): ${relativePath}`);
            continue;
          }

          // skip files that are too large (> 5MB)
          if (fileSize > 5 * 1024 * 1024) {
            this.logger.warn(`Skipping large file (${fileSize} bytes): ${relativePath}`);
            continue;
          }

          const content = await fs.readFile(absolutePath, "utf-8");
          const language = this._detectLanguageFromFileName(entry.name);

          this.logger.debug(`Found file: ${relativePath} (${language})`);
          files.push({
            path: relativePath,
            absolutePath,
            content,
            language,
          });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error walking directory ${currentPath}: ${errorMessage}`);
    }

    return files;
  }

  _detectLanguageFromFileName(
    fileName: string,
  ): "typescript" | "javascript" | "json" | "yaml" | "prisma" | "pdf" | "markdown" | "plaintext" {
    const ext = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();

    if ([".ts", ".tsx"].includes(ext)) return "typescript";
    if ([".js", ".jsx"].includes(ext)) return "javascript";
    if (ext === ".json") return "json";
    if ([".yml", ".yaml"].includes(ext)) return "yaml";
    if (ext === ".prisma") return "prisma";
    if (ext === ".pdf") return "pdf";
    if ([".md", ".markdown"].includes(ext)) return "markdown";
    if ([".gitignore", ".env", ".example", ".npmrc", ".nvmrc", ".prettierrc", ".eslintrc"].includes(fileName)) {
      return "plaintext";
    }

    return "plaintext";
  }
}
