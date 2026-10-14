import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const YAML = require("yaml");

const failures = [];

function fail(msg) {
  failures.push(msg);
}

function readText(path) {
  return readFileSync(path, "utf-8");
}

function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  return YAML.parse(match[1]);
}

// ── 1. package.json ──────────────────────────────────────────────────────────

{
  const pkgPath = join(ROOT, "package.json");
  let pkg;
  try {
    pkg = JSON.parse(readText(pkgPath));
  } catch {
    fail("package.json: missing or invalid JSON");
    pkg = null;
  }

  if (pkg) {
    // Required top-level fields
    for (const key of ["name", "version", "description", "license"]) {
      if (pkg[key] === undefined) fail(`package.json: missing "${key}"`);
    }
    if (pkg.type !== "module")
      fail(`package.json: "type" must be "module", got "${pkg.type}"`);
    if (pkg.exports?.["."] === undefined)
      fail('package.json: missing exports["."]');
    if (!Array.isArray(pkg.files))
      fail('package.json: "files" must be an array');
    if (typeof pkg.scripts?.test !== "string")
      fail("package.json: missing scripts.test");
    if (typeof pkg.scripts?.typecheck !== "string")
      fail("package.json: missing scripts.typecheck");
    if (typeof pkg.engines?.node !== "string")
      fail("package.json: missing engines.node");
    if (!Array.isArray(pkg.pi?.extensions))
      fail("package.json: missing pi.extensions array");
    if (!Array.isArray(pkg.pi?.skills))
      fail("package.json: missing pi.skills array");

    // Every path in `files` must exist on disk (skip package-lock.json)
    if (Array.isArray(pkg.files)) {
      for (const f of pkg.files) {
        if (f === "package-lock.json") continue;
        const full = join(ROOT, f);
        if (!existsSync(full)) {
          fail(`package.json: "files" entry "${f}" does not exist on disk`);
        }
      }
    }
  }
}

// ── 2. agents/*.md ───────────────────────────────────────────────────────────

{
  // Cross-check the hardcoded REQUIRED_IDS against the ROLE_IDS tuple
  // parsed from core/roles.ts source so the two never silently diverge.
  const rolesSrc = readText(join(ROOT, "core", "roles.ts"));
  const rolesMatch = rolesSrc.match(/ROLE_IDS\s*=\s*\[([^\]]*)\]\s*as\s*const/);
  const sourceRoleIds = rolesMatch
    ? [...rolesMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
    : null;

  const REQUIRED_IDS = [
    "microspec-researcher",
    "microspec-drafter",
    "microspec-critic",
    "microspec-implementer",
    "microspec-verifier",
    "microspec-reviewer",
    "microspec-docwriter",
    "microspec-planner",
    "microspec-retrospector",
  ];

  if (sourceRoleIds) {
    for (const id of sourceRoleIds) {
      if (!REQUIRED_IDS.includes(id))
        fail(
          `check.mjs: REQUIRED_IDS missing "${id}" (present in core/roles.ts ROLE_IDS)`,
        );
    }
    for (const id of REQUIRED_IDS) {
      if (!sourceRoleIds.includes(id))
        fail(
          `check.mjs: REQUIRED_IDS has "${id}" not in core/roles.ts ROLE_IDS`,
        );
    }
  } else {
    fail("core/roles.ts: cannot find ROLE_IDS = [...] as const");
  }
  const agentsDir = join(ROOT, "agents");
  if (!existsSync(agentsDir)) {
    fail("agents/: directory missing");
  } else {
    const files = readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
    const ids = files.map((f) => f.replace(/\.md$/, ""));

    // Exact set match
    for (const id of REQUIRED_IDS) {
      if (!ids.includes(id)) fail(`agents/: missing ${id}.md`);
    }
    for (const id of ids) {
      if (!REQUIRED_IDS.includes(id)) fail(`agents/: unexpected ${id}.md`);
    }

    for (const id of ids) {
      const path = join(agentsDir, `${id}.md`);
      const text = readText(path);
      const fm = parseFrontmatter(text);

      if (!fm) {
        fail(`agents/${id}.md: missing or invalid YAML frontmatter`);
        continue;
      }

      // description: required string
      if (typeof fm.description !== "string")
        fail(`agents/${id}.md: frontmatter "description" must be a string`);

      // mode: required, must be "subagent"
      if (typeof fm.mode !== "string" || fm.mode !== "subagent")
        fail(`agents/${id}.md: frontmatter "mode" must be "subagent"`);

      // color: optional string
      if (fm.color !== undefined && typeof fm.color !== "string")
        fail(`agents/${id}.md: frontmatter "color" must be a string`);

      // Reject legacy keys
      if ("tools" in fm) fail(`agents/${id}.md: legacy key "tools" removed`);
      if ("permissions" in fm)
        fail(`agents/${id}.md: legacy key "permissions" removed`);

      // No model: key
      if (fm.model !== undefined)
        fail(`agents/${id}.md: forbidden key "model"`);
    }
  }

  // No model: key in skills/ frontmatter either
  const skillsDir = join(ROOT, "skills");
  if (existsSync(skillsDir)) {
    const skillDirs = readdirSync(skillsDir, { withFileTypes: true }).filter(
      (e) => e.isDirectory(),
    );
    for (const sd of skillDirs) {
      const skillFile = join(skillsDir, sd.name, "SKILL.md");
      if (!existsSync(skillFile)) continue;
      const text = readText(skillFile);
      const fm = parseFrontmatter(text);
      if (fm && fm.model !== undefined)
        fail(`skills/${sd.name}/SKILL.md: forbidden key "model"`);
    }
  }
}

// ── 3. skills/ ───────────────────────────────────────────────────────────────

{
  const SKILL_IDS = [
    "microspec-brief",
    "microspec-execute",
    "microspec-retro",
    "task-contract",
  ];
  const CANONICAL_SECTIONS = [
    "Goal",
    "Non-goals",
    "Context",
    "Plan",
    "Guardrails",
    "Acceptance criteria",
    "Result",
  ];
  const skillsDir = join(ROOT, "skills");

  if (!existsSync(skillsDir)) {
    fail("skills/: directory missing");
  } else {
    for (const id of SKILL_IDS) {
      const path = join(skillsDir, id, "SKILL.md");
      if (!existsSync(path)) {
        fail(`skills/${id}/SKILL.md: file missing`);
        continue;
      }
      const text = readText(path);
      const fm = parseFrontmatter(text);
      if (!fm) {
        fail(`skills/${id}/SKILL.md: missing or invalid YAML frontmatter`);
        continue;
      }
      if (fm.name !== id)
        fail(
          `skills/${id}/SKILL.md: frontmatter name must be "${id}", got "${fm.name}"`,
        );
      if (typeof fm.description !== "string" || fm.description.length === 0)
        fail(
          `skills/${id}/SKILL.md: frontmatter description must be a non-empty string`,
        );
    }

    // Canonical sections must appear in task-contract/SKILL.md
    const tcPath = join(skillsDir, "task-contract", "SKILL.md");
    if (existsSync(tcPath)) {
      const text = readText(tcPath);
      for (const section of CANONICAL_SECTIONS) {
        if (!text.includes(`## ${section}`))
          fail(
            `skills/task-contract/SKILL.md: missing canonical section "## ${section}"`,
          );
      }
    }
  }
}

// ── 4. core/contract.ts REQUIRED_SECTIONS ────────────────────────────────────

{
  const CANONICAL = [
    "Goal",
    "Non-goals",
    "Context",
    "Plan",
    "Guardrails",
    "Acceptance criteria",
    "Result",
  ];
  const contractPath = join(ROOT, "core", "contract.ts");
  if (!existsSync(contractPath)) {
    fail("core/contract.ts: file missing");
  } else {
    const src = readText(contractPath);

    // Extract the REQUIRED_SECTIONS array literal from source
    const match = src.match(
      /REQUIRED_SECTIONS\s*=\s*\[([^\]]*)\]\s*as\s*const/,
    );
    if (!match) {
      fail("core/contract.ts: cannot find REQUIRED_SECTIONS = [...] as const");
    } else {
      // Extract quoted strings from the array body
      const entries = [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      for (const name of CANONICAL) {
        if (!entries.includes(name))
          fail(`core/contract.ts: REQUIRED_SECTIONS missing "${name}"`);
      }
      for (const entry of entries) {
        if (!CANONICAL.includes(entry))
          fail(
            `core/contract.ts: REQUIRED_SECTIONS has unexpected entry "${entry}"`,
          );
      }
    }
  }
}

// ── 5. README.md positioning text ────────────────────────────────────────────

{
  const readmePath = join(ROOT, "README.md");
  if (!existsSync(readmePath)) {
    fail("README.md: file missing");
  } else {
    const text = readText(readmePath);
    const lines = text.split(/\r?\n/);
    const expectedLines = [
      "Task Contract is a lightweight, task-scoped application of Micro-SDD.",
      "It turns a user request into one executable TASK.md with explicit scope, non-goals, Given/When/Then acceptance criteria, a dependency-aware checklist, subagent assignments, and evidence-backed completion.",
    ];
    for (const expected of expectedLines) {
      if (!lines.some((l) => l.trimEnd() === expected))
        fail(`README.md: missing exact line "${expected}"`);
    }
  }
}

// ── 6. Required source files ─────────────────────────────────────────────────

{
  const REQUIRED_FILES = [
    "index.ts",
    "opencode/index.ts",
    "pi/index.ts",
    "core/markdown.ts",
    "core/roles.ts",
    "core/contract.ts",
    "core/gitignore.ts",
    "core/prompts.ts",
  ];

  for (const f of REQUIRED_FILES) {
    const full = join(ROOT, f);
    if (!existsSync(full)) fail(`${f}: file missing`);
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`check.mjs: ${failures.length} failure(s):\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log("check.mjs: all checks passed");
