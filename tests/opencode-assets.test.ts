// Integration guard: verifies the real repo assets (agents/*.md and
// skills/*/SKILL.md) satisfy the invariants the OpenCode adapter relies on.
// Uses import.meta.dirname-relative paths to the repo root.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { readFileSync } from "node:fs";
import { loadRoles, ROLE_IDS } from "../core/roles.ts";
import { parseMarkdown, validateSkillDoc } from "../core/markdown.ts";

const repoRoot = path.join(import.meta.dirname, "..");
const agentsDir = path.join(repoRoot, "agents");
const skillsRoot = path.join(repoRoot, "skills");
const SKILL_IDS = [
  "microspec-brief",
  "microspec-execute",
  "microspec-retro",
  "task-contract",
] as const;

test("loadRoles: returns exactly the 9 ROLE_IDS in sorted order", () => {
  const roles = loadRoles(agentsDir);
  assert.equal(roles.length, ROLE_IDS.length);
  // loadRoles sorts by id alphabetically; compare against sorted ROLE_IDS.
  const sorted = [...ROLE_IDS].sort();
  for (let i = 0; i < sorted.length; i++) {
    assert.equal(roles[i]!.id, sorted[i]);
  }
});

test("loadRoles: every role has mode=subagent and a description", () => {
  const roles = loadRoles(agentsDir);
  for (const role of roles) {
    assert.equal(
      role.mode,
      "subagent",
      `role ${role.id} must have mode "subagent"`,
    );
    assert.ok(
      typeof role.description === "string" && role.description.length > 0,
      `role ${role.id} must have a non-empty description`,
    );
  }
});

test("skills: each of the 4 skills parses and name equals directory name", () => {
  for (const id of SKILL_IDS) {
    const skillPath = path.join(skillsRoot, id, "SKILL.md");
    const raw = readFileSync(skillPath, "utf8");
    const { frontmatter, body } = parseMarkdown<unknown>(raw);
    const doc = validateSkillDoc(frontmatter);

    // Skill name must equal the directory name (routing invariant).
    assert.equal(
      doc.name,
      id,
      `skill ${id}: name in frontmatter must equal directory name`,
    );
    // Description must be a non-empty string.
    assert.ok(
      typeof doc.description === "string" && doc.description.length > 0,
      `skill ${id}: description must be a non-empty string`,
    );
    // Body must be non-empty.
    assert.ok(body.trim().length > 0, `skill ${id}: body must be non-empty`);
  }
});
