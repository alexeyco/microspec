// Tests for core/roles.ts — loadRoles with fixture files in a tmpdir.

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadRoles, ROLE_IDS, type RoleId } from "../core/roles.ts";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "microspec-roles-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function yamlScalar(v: unknown): string {
  if (typeof v === "string") {
    // Quote strings that contain YAML special chars
    if (/[*#{}\[\],&!?|>'"%@`]/.test(v) || v === "") {
      return JSON.stringify(v);
    }
    return v;
  }
  return String(v);
}

function writeRole(
  filename: string,
  frontmatter: Record<string, unknown>,
  body = "Role body content",
): void {
  // Simple YAML serialization for test fixtures
  const lines = ["---"];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        if (typeof item === "object" && item !== null) {
          const entries = Object.entries(item)
            .map(([k, v]) => `${k}: ${yamlScalar(v)}`)
            .join(", ");
          lines.push(`  - { ${entries} }`);
        } else {
          lines.push(`  - ${yamlScalar(item)}`);
        }
      }
    } else {
      lines.push(`${key}: ${yamlScalar(value)}`);
    }
  }
  lines.push("---");
  lines.push("");
  lines.push(body);
  lines.push("");
  writeFileSync(join(tempDir, filename), lines.join("\n"));
}

describe("ROLE_IDS", () => {
  it("contains exactly the nine expected role ids", () => {
    assert.deepEqual(
      [...ROLE_IDS],
      [
        "microspec-researcher",
        "microspec-drafter",
        "microspec-critic",
        "microspec-implementer",
        "microspec-verifier",
        "microspec-reviewer",
        "microspec-docwriter",
        "microspec-planner",
        "microspec-retrospector",
      ],
    );
  });
});

describe("RoleId type", () => {
  it("accepts valid role id strings", () => {
    const id: RoleId = "microspec-researcher";
    assert.equal(id, "microspec-researcher");
  });
});

describe("loadRoles", () => {
  it("returns empty array for empty directory", () => {
    const roles = loadRoles(tempDir);
    assert.deepEqual(roles, []);
  });

  it("loads and sorts roles by id", () => {
    writeRole("microspec-implementer.md", {
      description: "Implement steps",
      mode: "subagent",
    });
    writeRole("microspec-researcher.md", {
      description: "Research the codebase",
      mode: "subagent",
    });

    const roles = loadRoles(tempDir);
    assert.equal(roles.length, 2);
    assert.equal(roles[0]!.id, "microspec-implementer");
    assert.equal(roles[1]!.id, "microspec-researcher");
  });

  it("includes body text", () => {
    writeRole(
      "microspec-critic.md",
      {
        description: "Critique drafts",
        mode: "subagent",
      },
      "Critique body here",
    );

    const roles = loadRoles(tempDir);
    assert.equal(roles.length, 1);
    assert.ok(roles[0]!.body.includes("Critique body here"));
  });

  it("preserves color when present", () => {
    writeRole("microspec-verifier.md", {
      description: "Verify criteria",
      mode: "subagent",
      color: "#fbbf24",
    });

    const roles = loadRoles(tempDir);
    assert.equal(roles[0]!.color, "#fbbf24");
  });

  it("includes mode from frontmatter", () => {
    writeRole("microspec-drafter.md", {
      description: "Draft tasks",
      mode: "subagent",
    });

    const roles = loadRoles(tempDir);
    assert.equal(roles[0]!.mode, "subagent");
  });

  it("throws on non-role .md files", () => {
    writeFileSync(join(tempDir, "README.md"), "# Not a role");
    // loadRoles reads all *.md — README.md lacks valid frontmatter
    assert.throws(
      () => loadRoles(tempDir),
      (err: Error) => err.message.startsWith("markdown: "),
    );
  });

  it("throws on invalid role doc", () => {
    writeFileSync(
      join(tempDir, "microspec-broken.md"),
      "---\ndescription: 42\nmode: subagent\n---\nbody\n",
    );

    assert.throws(
      () => loadRoles(tempDir),
      (err: Error) => err.message.startsWith("role doc: "),
    );
  });
});
