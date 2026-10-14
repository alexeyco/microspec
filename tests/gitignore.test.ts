// Tests for core/gitignore.ts — pure helpers + ensureTaskIgnored with tmpdirs.

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  findRepoRoot,
  gitignoreIgnores,
  appendIgnoreEntry,
  ensureTaskIgnored,
} from "../core/gitignore.ts";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "microspec-git-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("findRepoRoot", () => {
  it("finds repo root with .git directory", () => {
    const gitDir = join(tempDir, ".git");
    mkdirSync(gitDir);
    const subDir = join(tempDir, "a", "b");
    mkdirSync(subDir, { recursive: true });

    const root = findRepoRoot(subDir);
    assert.equal(root, tempDir);
  });

  it("finds repo root with .git file (worktree)", () => {
    writeFileSync(join(tempDir, ".git"), "gitdir: /somewhere");
    const root = findRepoRoot(tempDir);
    assert.equal(root, tempDir);
  });

  it("returns undefined when no .git found", () => {
    const subDir = join(tempDir, "no-git");
    mkdirSync(subDir);
    const root = findRepoRoot(subDir);
    assert.equal(root, undefined);
  });

  it("returns the start dir itself when it contains .git", () => {
    mkdirSync(join(tempDir, ".git"));
    const root = findRepoRoot(tempDir);
    assert.equal(root, tempDir);
  });
});

describe("gitignoreIgnores", () => {
  it("matches exact filename", () => {
    assert.ok(gitignoreIgnores("TASK.md\n", "TASK.md"));
  });

  it("matches with leading slash", () => {
    assert.ok(gitignoreIgnores("/TASK.md\n", "TASK.md"));
  });

  it("matches with ./ prefix", () => {
    assert.ok(gitignoreIgnores("./TASK.md\n", "TASK.md"));
  });

  it("does not match different filename", () => {
    assert.ok(!gitignoreIgnores("OTHER.md\n", "TASK.md"));
  });

  it("handles negation", () => {
    assert.ok(!gitignoreIgnores("TASK.md\n!TASK.md\n", "TASK.md"));
  });

  it("skips comments and blank lines", () => {
    assert.ok(gitignoreIgnores("# comment\n\nTASK.md\n", "TASK.md"));
  });

  it("returns false for empty content", () => {
    assert.ok(!gitignoreIgnores("", "TASK.md"));
  });

  it("last matching line wins", () => {
    // Ignored, then negated, then ignored again
    assert.ok(gitignoreIgnores("TASK.md\n!TASK.md\nTASK.md\n", "TASK.md"));
  });
});

describe("appendIgnoreEntry", () => {
  it("appends to empty content", () => {
    const result = appendIgnoreEntry("", "TASK.md");
    assert.equal(result, "TASK.md\n");
  });

  it("appends with newline to content without trailing newline", () => {
    const result = appendIgnoreEntry("node_modules", "TASK.md");
    assert.equal(result, "node_modules\nTASK.md\n");
  });

  it("appends to content with trailing newline", () => {
    const result = appendIgnoreEntry("node_modules\n", "TASK.md");
    assert.equal(result, "node_modules\nTASK.md\n");
  });

  it("normalizes multiple trailing newlines", () => {
    const result = appendIgnoreEntry("node_modules\n\n\n", "TASK.md");
    assert.equal(result, "node_modules\nTASK.md\n");
  });
});

describe("ensureTaskIgnored", () => {
  it("returns no-git when no repo found", async () => {
    const subDir = join(tempDir, "no-repo");
    mkdirSync(subDir);
    const result = await ensureTaskIgnored(subDir);
    assert.deepEqual(result, {
      changed: false,
      reason: "no-git",
    });
  });

  it("creates .gitignore when missing", async () => {
    mkdirSync(join(tempDir, ".git"));
    const result = await ensureTaskIgnored(tempDir);
    assert.deepEqual(result, {
      changed: true,
      reason: "created",
    });
    const content = readFileSync(join(tempDir, ".gitignore"), "utf-8");
    assert.ok(content.includes("TASK.md"));
  });

  it("returns ignored when already present", async () => {
    mkdirSync(join(tempDir, ".git"));
    writeFileSync(join(tempDir, ".gitignore"), "TASK.md\n");
    const result = await ensureTaskIgnored(tempDir);
    assert.deepEqual(result, {
      changed: false,
      reason: "ignored",
    });
  });

  it("appends when .gitignore exists but TASK.md not listed", async () => {
    mkdirSync(join(tempDir, ".git"));
    writeFileSync(join(tempDir, ".gitignore"), "node_modules\n");
    const result = await ensureTaskIgnored(tempDir);
    assert.deepEqual(result, {
      changed: true,
      reason: "appended",
    });
    const content = readFileSync(join(tempDir, ".gitignore"), "utf-8");
    assert.ok(content.includes("TASK.md"));
    assert.ok(content.includes("node_modules"));
  });

  it("is idempotent on second call", async () => {
    mkdirSync(join(tempDir, ".git"));
    const r1 = await ensureTaskIgnored(tempDir);
    assert.equal(r1.changed, true);
    const r2 = await ensureTaskIgnored(tempDir);
    assert.equal(r2.changed, false);
    assert.equal(r2.reason, "ignored");
  });
});
