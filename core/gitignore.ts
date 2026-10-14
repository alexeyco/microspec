// Git-ignore helpers: find repo root, pure ignore matching/appending,
// and an async ensureTaskIgnored that wires them together.

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TASK_FILENAME } from "./contract.ts";

export type IgnoreReason = "ignored" | "appended" | "created" | "no-git";

export interface EnsureIgnoredResult {
  readonly changed: boolean;
  readonly reason: IgnoreReason;
}

// Walk up from startDir looking for a `.git` entry (dir or file).
// Returns the repo root directory path, or undefined if none found.
export function findRepoRoot(startDir: string): string | undefined {
  let dir = startDir;
  while (true) {
    const candidate = join(dir, ".git");
    if (existsSync(candidate)) {
      // Could be a directory (normal repo) or a file (worktree/submodule)
      try {
        statSync(candidate);
        return dir;
      } catch {
        // Broken symlink or inaccessible — keep walking
      }
    }
    const parent = join(dir, "..");
    if (parent === dir) return undefined;
    dir = parent;
  }
}

// Pure: check if a gitignore content string causes `filename` to be ignored.
// Matches exact lines: `X`, `/X`, `./X`. `!X` negates. Comments/blank skipped.
export function gitignoreIgnores(content: string, filename: string): boolean {
  let ignored = false;
  const lines = content.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;

    // Negation
    if (line.startsWith("!")) {
      const pattern = line.slice(1);
      if (matchesPattern(pattern, filename)) {
        ignored = false;
      }
      continue;
    }

    if (matchesPattern(line, filename)) {
      ignored = true;
    }
  }
  return ignored;
}

// Match a single gitignore pattern against a filename.
// Handles `X`, `/X`, `./X` forms.
function matchesPattern(pattern: string, filename: string): boolean {
  // Normalize: strip leading / or ./
  let normalized = pattern;
  if (normalized.startsWith("/")) {
    normalized = normalized.slice(1);
  }
  if (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }
  return normalized === filename;
}

// Pure: append a filename entry to gitignore content, ensuring exactly
// one trailing newline before the entry.
export function appendIgnoreEntry(content: string, filename: string): string {
  if (content === "") {
    return `${filename}\n`;
  }
  // Ensure content ends with exactly one newline before appending
  let base = content;
  // Strip trailing newlines, then add one
  base = base.replace(/\n+$/, "");
  return `${base}\n${filename}\n`;
}

// Async: ensure TASK.md is git-ignored in the repo containing cwd.
export async function ensureTaskIgnored(
  cwd: string,
): Promise<EnsureIgnoredResult> {
  const root = findRepoRoot(cwd);
  if (!root) {
    return { changed: false, reason: "no-git" };
  }

  const gitignorePath = join(root, ".gitignore");

  // If .gitignore doesn't exist, create it with TASK.md
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, `${TASK_FILENAME}\n`, "utf-8");
    return { changed: true, reason: "created" };
  }

  const content = readFileSync(gitignorePath, "utf-8");

  // Already ignored — no change needed
  if (gitignoreIgnores(content, TASK_FILENAME)) {
    return { changed: false, reason: "ignored" };
  }

  // Append the entry
  const updated = appendIgnoreEntry(content, TASK_FILENAME);
  writeFileSync(gitignorePath, updated, "utf-8");
  return { changed: true, reason: "appended" };
}
