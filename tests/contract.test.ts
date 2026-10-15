// Tests for core/contract.ts — template round-trip and validateTask rules.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TASK_FILENAME,
  TASK_STATUSES,
  REQUIRED_SECTIONS,
  renderTaskDraft,
  parseTask,
  validateTask,
  reportTask,
  formatTaskReport,
} from "../core/contract.ts";

// Build a valid, filled-in TASK.md from the draft template.
function buildValidTask(overrides: Record<string, string> = {}): string {
  const draft = renderTaskDraft({
    created: "2025-01-01T00:00:00Z",
    title: "Test task",
  });

  // Replace placeholder sections with real content
  let task = draft;
  task = task.replace(
    "<One paragraph: the desired end state. No implementation plan.>",
    overrides["Goal"] ?? "Implement feature X.",
  );
  task = task.replace(
    '- <Out of scope. Never leave empty; write "None" if there is truly nothing.>',
    overrides["Non-goals"] ?? "None",
  );
  task = task.replace(
    "- <Verifiable facts only: file paths, commands, versions, observed behavior.>",
    overrides["Context"] ?? "- File src/main.ts exists",
  );
  task = task.replace(
    "- [ ] **S1** <step summary> (deps: —)\n  - Owner: microspec-implementer\n  - Evidence: <command/output/artifact proving the step is complete>",
    overrides["Plan"] ??
      "- [ ] **S1** Write code (deps: —)\n  - Owner: microspec-implementer\n  - Evidence: tests pass",
  );
  task = task.replace(
    "- <Short imperative prohibition or stop point. No explanations.>",
    overrides["Guardrails"] ?? "- Do not break existing tests",
  );
  task = task.replace(
    "- **AC1** Given <state> When <action> Then <observable outcome>",
    overrides["Acceptance criteria"] ??
      "- **AC1** Given a clean repo When I run tests Then they pass",
  );
  task = task.replace(
    "<!-- Append-only journal. Filled only during /microspec.execute. -->",
    overrides["Result"] ?? "Wave 1 complete.",
  );

  return task;
}

describe("constants", () => {
  it("TASK_FILENAME is TASK.md", () => {
    assert.equal(TASK_FILENAME, "TASK.md");
  });

  it("TASK_STATUSES contains all five statuses", () => {
    assert.deepEqual(
      [...TASK_STATUSES],
      ["draft", "ready", "in_progress", "blocked", "done"],
    );
  });

  it("REQUIRED_SECTIONS has seven entries in execution logic order", () => {
    assert.equal(REQUIRED_SECTIONS.length, 7);
    assert.deepEqual(
      [...REQUIRED_SECTIONS],
      [
        "Goal",
        "Non-goals",
        "Context",
        "Plan",
        "Guardrails",
        "Acceptance criteria",
        "Result",
      ],
    );
  });
});

describe("renderTaskDraft", () => {
  it("does not include id in frontmatter", () => {
    const draft = renderTaskDraft({
      created: "2025-01-01T00:00:00Z",
      title: "My task",
    });
    assert.ok(!draft.includes("id:"));
  });

  it("includes status: draft", () => {
    const draft = renderTaskDraft({
      created: "2025-01-01T00:00:00Z",
      title: "Test",
    });
    assert.ok(draft.includes("status: draft"));
  });

  it("includes the title as H1", () => {
    const draft = renderTaskDraft({
      created: "2025-01-01T00:00:00Z",
      title: "My Task Title",
    });
    assert.ok(draft.includes("# My Task Title"));
  });

  it("contains all required sections", () => {
    const draft = renderTaskDraft({
      created: "2025-01-01T00:00:00Z",
      title: "Test",
    });
    for (const section of REQUIRED_SECTIONS) {
      assert.ok(draft.includes(`## ${section}`), `Missing section: ${section}`);
    }
  });

  it("emits sections in execution logic order", () => {
    const draft = renderTaskDraft({
      created: "2025-01-01T00:00:00Z",
      title: "Test",
    });
    const positions = REQUIRED_SECTIONS.map((s) => draft.indexOf(`## ${s}`));
    for (let i = 1; i < positions.length; i++) {
      assert.ok(
        positions[i]! > positions[i - 1]!,
        `Section "${REQUIRED_SECTIONS[i]}" should appear after "${REQUIRED_SECTIONS[i - 1]}"`,
      );
    }
  });
});

describe("parseTask", () => {
  it("parses a valid task", () => {
    const task = buildValidTask();
    const parsed = parseTask(task);
    assert.equal(parsed.header.status, "draft");
    assert.equal(parsed.title, "Test task");
    assert.ok("Goal" in parsed.sections);
    assert.ok("Result" in parsed.sections);
  });

  it("throws on missing frontmatter", () => {
    assert.throws(
      () => parseTask("no frontmatter"),
      (err: Error) => err.message.startsWith("task: "),
    );
  });

  it("extracts title from first H1", () => {
    const task = buildValidTask();
    const parsed = parseTask(task);
    assert.equal(parsed.title, "Test task");
  });

  it("returns empty title when no H1 present", () => {
    const raw = [
      "---",
      "status: draft",
      "created: 2025-01-01T00:00:00Z",
      "updated: 2025-01-01T00:00:00Z",
      "---",
      "",
      "## Goal",
      "",
      "Some goal",
    ].join("\n");
    const parsed = parseTask(raw);
    assert.equal(parsed.title, "");
  });
});

describe("validateTask — round-trip", () => {
  it("valid filled template produces no violations", () => {
    const task = buildValidTask();
    const violations = validateTask(task);
    assert.deepEqual(violations, []);
  });
});

describe("validateTask — rule 1: header", () => {
  it("reports invalid status", () => {
    let task = buildValidTask();
    task = task.replace("status: draft", "status: invalid");
    const violations = validateTask(task);
    assert.ok(violations.some((v) => v.includes("status")));
  });

  it("reports empty created", () => {
    let task = buildValidTask();
    task = task.replace("created: 2025-01-01T00:00:00Z", "created: ");
    const violations = validateTask(task);
    assert.ok(violations.some((v) => v.includes("created")));
  });

  it("reports empty updated", () => {
    let task = buildValidTask();
    task = task.replace("updated: 2025-01-01T00:00:00Z", "updated: ");
    const violations = validateTask(task);
    assert.ok(violations.some((v) => v.includes("updated")));
  });
});

describe("validateTask — rule 2: required sections", () => {
  it("reports missing section", () => {
    let task = buildValidTask();
    // Remove the Goal section entirely
    task = task.replace(/## Goal\n[\s\S]*?(?=## )/, "");
    const violations = validateTask(task);
    assert.ok(violations.some((v) => v.includes("Goal")));
  });
});

describe("validateTask — rule 3: non-empty sections", () => {
  it("reports empty Goal", () => {
    let task = buildValidTask();
    task = task.replace("Implement feature X.", "   ");
    const violations = validateTask(task);
    assert.ok(violations.some((v) => v.includes("Goal")));
  });

  it("reports empty Non-goals with specific message", () => {
    let task = buildValidTask();
    task = task.replace("None", "   ");
    const violations = validateTask(task);
    assert.ok(
      violations.some((v) =>
        v.includes(
          'Non-goals must not be empty; write "None" when there are none',
        ),
      ),
    );
  });

  it("reports empty Context", () => {
    let task = buildValidTask();
    task = task.replace("- File src/main.ts exists", "   ");
    const violations = validateTask(task);
    assert.ok(violations.some((v) => v.includes("Context")));
  });

  it("reports empty Guardrails", () => {
    let task = buildValidTask();
    task = task.replace("- Do not break existing tests", "   ");
    const violations = validateTask(task);
    assert.ok(violations.some((v) => v.includes("Guardrails")));
  });
});

describe("validateTask — rule 4: acceptance criteria", () => {
  it("reports no bullets", () => {
    let task = buildValidTask();
    task = task.replace(
      "- **AC1** Given a clean repo When I run tests Then they pass",
      "no bullets here",
    );
    const violations = validateTask(task);
    assert.ok(violations.some((v) => v.includes("Acceptance criteria")));
  });

  it("reports bullet missing Given/When/Then", () => {
    let task = buildValidTask();
    task = task.replace(
      "- **AC1** Given a clean repo When I run tests Then they pass",
      "- **AC1** Just a plain statement",
    );
    const violations = validateTask(task);
    assert.ok(violations.some((v) => v.includes("Given, When, Then")));
  });

  it("accepts a bullet whose Then appears only on a wrapped continuation line", () => {
    const task = buildValidTask({
      "Acceptance criteria":
        "- **AC1** Given a clean repo\n  When I run tests\n  Then they pass",
    });
    const violations = validateTask(task);
    assert.deepEqual(violations, []);
  });

  it("reports the bullet index when a wrapped bullet is missing a keyword", () => {
    const task = buildValidTask({
      "Acceptance criteria":
        "- **AC1** Given a clean repo\n  When I run tests\n  Then they pass\n" +
        "- **AC2** Given a dirty repo\n  When I clean it",
    });
    const violations = validateTask(task);
    assert.ok(
      violations.includes(
        "Acceptance criteria: bullet 2 must contain Given, When, Then",
      ),
    );
  });

  it("ignores HTML comments when matching Given, When, Then", () => {
    const task = buildValidTask({
      "Acceptance criteria":
        "- **AC1** Given a clean repo <!-- when --> <!-- then -->\n  ok",
    });
    const violations = validateTask(task);
    assert.ok(
      violations.includes(
        "Acceptance criteria: bullet 1 must contain Given, When, Then",
      ),
    );
  });

  it("extracts the fenced example TASK.md from the task-contract skill and reports zero rule-4 violations", () => {
    const skillPath = new URL(
      "../skills/task-contract/SKILL.md",
      import.meta.url,
    );
    const skill = readFileSync(skillPath, "utf8");
    const blocks = skill.match(/```markdown\n([\s\S]*?)\n```/g) ?? [];
    const example = blocks.find((b) => b.includes("## Acceptance criteria"));
    assert.ok(
      example !== undefined,
      "skills/task-contract/SKILL.md must contain a fenced example TASK.md block",
    );
    const raw = example!.replace(/^```markdown\n/, "").replace(/\n```$/, "");
    const violations = validateTask(raw);
    assert.deepEqual(
      violations.filter((v) => v.includes("Acceptance criteria")),
      [],
      "the example wraps AC bullet continuations; rule 4 must report nothing",
    );
    // The example is fully valid: it contains wrapped bullets and the
    // unticked steps sit under status: draft, so no other rule fires.
    assert.deepEqual(violations, []);
  });
});

describe("validateTask — rule 5: plan", () => {
  it("reports no checkbox steps", () => {
    let task = buildValidTask();
    task = task.replace(
      "- [ ] **S1** Write code (deps: —)\n  - Owner: microspec-implementer\n  - Evidence: tests pass",
      "no steps here",
    );
    const violations = validateTask(task);
    assert.ok(violations.some((v) => v.includes("Plan")));
  });

  it("reports step missing Owner", () => {
    let task = buildValidTask();
    task = task.replace(
      "- [ ] **S1** Write code (deps: —)\n  - Owner: microspec-implementer\n  - Evidence: tests pass",
      "- [ ] **S1** Write code (deps: —)\n  - Evidence: tests pass",
    );
    const violations = validateTask(task);
    assert.ok(violations.some((v) => v.includes("Owner")));
  });

  it("reports step missing Evidence", () => {
    let task = buildValidTask();
    task = task.replace(
      "- [ ] **S1** Write code (deps: —)\n  - Owner: microspec-implementer\n  - Evidence: tests pass",
      "- [ ] **S1** Write code (deps: —)\n  - Owner: microspec-implementer",
    );
    const violations = validateTask(task);
    assert.ok(violations.some((v) => v.includes("Evidence")));
  });
});

describe("validateTask — rule 6: result when done", () => {
  it("reports empty result when status is done", () => {
    let task = buildValidTask();
    task = task.replace("status: draft", "status: done");
    // Make result empty (remove the content)
    task = task.replace("Wave 1 complete.", "");
    const violations = validateTask(task);
    assert.ok(violations.some((v) => v.includes("Result")));
  });

  it("allows empty result when status is not done", () => {
    let task = buildValidTask();
    // status: draft, empty result should be fine
    task = task.replace("Wave 1 complete.", "");
    const violations = validateTask(task);
    assert.ok(!violations.some((v) => v.includes("Result")));
  });

  it("strips HTML comments when checking result emptiness", () => {
    let task = buildValidTask();
    task = task.replace("status: draft", "status: done");
    // Replace result with only an HTML comment
    task = task.replace("Wave 1 complete.", "<!-- just a comment -->");
    const violations = validateTask(task);
    assert.ok(violations.some((v) => v.includes("Result")));
  });

  it("reports unticked plan steps when status is done", () => {
    const task = buildValidTask({
      Plan:
        "- [x] **S21** First step (deps: —)\n  - Owner: microspec-implementer\n  - Evidence: done\n" +
        "- [ ] **S22** Second step (deps: S21)\n  - Owner: microspec-implementer\n  - Evidence: pending",
    }).replace("status: draft", "status: done");
    const violations = validateTask(task);
    assert.ok(
      violations.includes("Plan: step S22 not ticked while status is done"),
    );
    assert.ok(
      !violations.some((v) => v.includes("step S21")),
      "ticked steps must not be reported",
    );
  });

  it("falls back to the step ordinal when an unticked step line has no S-id", () => {
    const task = buildValidTask({
      Plan: "- [ ] Write code (deps: —)\n  - Owner: microspec-implementer\n  - Evidence: tests pass",
    }).replace("status: draft", "status: done");
    const violations = validateTask(task);
    assert.ok(
      violations.includes("Plan: step 1 not ticked while status is done"),
    );
  });

  it("accepts done with all steps ticked and a non-empty result", () => {
    const task = buildValidTask({
      Plan:
        "- [x] **S1** First step (deps: —)\n  - Owner: microspec-implementer\n  - Evidence: done\n" +
        "- [x] **S2** Second step (deps: S1)\n  - Owner: microspec-implementer\n  - Evidence: done",
    }).replace("status: draft", "status: done");
    const violations = validateTask(task);
    assert.deepEqual(violations, []);
  });

  it("still reports the rule 6 result violation when done with all steps ticked and empty result", () => {
    const task = buildValidTask({
      Plan: "- [x] **S1** Write code (deps: —)\n  - Owner: microspec-implementer\n  - Evidence: tests pass",
      Result: "",
    }).replace("status: draft", "status: done");
    const violations = validateTask(task);
    assert.ok(
      violations.includes("Result: must not be empty when status is done"),
    );
    assert.ok(
      !violations.some((v) => v.includes("not ticked")),
      "ticked steps must not add a Plan violation",
    );
  });
});

describe("parseTask — trailing-space heading boundaries", () => {
  it("empty Goal followed by '## Non-goals ' with trailing space must NOT swallow", () => {
    const raw = [
      "---",
      "status: draft",
      "created: 2025-01-01T00:00:00Z",
      "updated: 2025-01-01T00:00:00Z",
      "---",
      "",
      "# Test",
      "",
      "## Goal",
      "",
      "## Non-goals ",
      "",
      "Some non-goal content",
    ].join("\n");
    const parsed = parseTask(raw);
    // Goal section should be empty (or whitespace only), NOT contain non-goal content
    const goalContent = parsed.sections["Goal"] ?? "";
    assert.ok(
      !goalContent.includes("non-goal"),
      "Goal section must not swallow content from the next heading",
    );
    // Non-goals section should exist and contain the content
    assert.ok(
      "Non-goals" in parsed.sections,
      "Non-goals section must be present",
    );
    assert.ok(
      (parsed.sections["Non-goals"] ?? "").includes("Some non-goal content"),
    );
  });
});

describe("validateTask — word-boundary AC checks", () => {
  it("'strengthened' alone does not satisfy 'then'", () => {
    let task = buildValidTask();
    task = task.replace(
      "- **AC1** Given a clean repo When I run tests Then they pass",
      "- **AC1** Given a clean repo When I run tests it strengthened the code",
    );
    const violations = validateTask(task);
    assert.ok(
      violations.some((v) => v.includes("Given, When, Then")),
      "'strengthened' must not satisfy the 'then' word-boundary check",
    );
  });
});

describe("reportTask", () => {
  it("returns ok=true for a valid task", () => {
    const task = buildValidTask();
    const report = reportTask(task);
    assert.equal(report.ok, true);
    assert.ok(report.header);
    assert.equal(report.header.status, "draft");
    assert.equal(report.violations.length, 0);
  });

  it("returns violations for an invalid task", () => {
    let task = buildValidTask();
    task = task.replace("status: draft", "status: invalid");
    const report = reportTask(task);
    assert.equal(report.ok, false);
    assert.ok(report.violations.length > 0);
  });

  it("returns parse error as violation", () => {
    const report = reportTask("no frontmatter at all");
    assert.equal(report.ok, false);
    assert.ok(report.violations.some((v) => v.startsWith("parse: ")));
    assert.equal(report.header, undefined);
  });
});

describe("formatTaskReport", () => {
  it("formats a valid report without id", () => {
    const report = reportTask(buildValidTask());
    const text = formatTaskReport(report);
    assert.match(text, /^VALID status=draft$/);
  });

  it("formats an invalid report with numbered violations", () => {
    const report = reportTask("no frontmatter");
    const text = formatTaskReport(report);
    assert.match(text, /^INVALID \d+ violation\(s\):/);
    assert.ok(text.includes("1. "));
  });
});
