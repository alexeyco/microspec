// Tests for the shared validate-task report formatting (core/contract.ts).
// Both adapters (opencode + pi) use reportTask + formatTaskReport;
// these tests exercise the pure formatting logic without spawning sessions.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  reportTask,
  formatTaskReport,
  renderTaskDraft,
  type TaskFileReport,
} from "../core/contract.ts";

// Build a minimal valid TASK.md for report tests.
function validTask(): string {
  const draft = renderTaskDraft({
    created: "2025-06-01T00:00:00Z",
    title: "Report test",
  });

  let task = draft;
  task = task.replace(
    "<One paragraph: the desired end state. No implementation plan.>",
    "Implement feature Y.",
  );
  task = task.replace(
    '- <Out of scope. Never leave empty; write "None" if there is truly nothing.>',
    "None",
  );
  task = task.replace(
    "- <Verifiable facts only: file paths, commands, versions, observed behavior.>",
    "- File src/index.ts exists",
  );
  task = task.replace(
    "- [ ] **S1** <step summary> (deps: —)\n  - Owner: microspec-implementer\n  - Evidence: <command/output/artifact proving the step is complete>",
    "- [ ] **S1** Build (deps: —)\n  - Owner: microspec-implementer\n  - Evidence: build passes",
  );
  task = task.replace(
    "- <Short imperative prohibition or stop point. No explanations.>",
    "- Do not break CI",
  );
  task = task.replace(
    "- **AC1** Given <state> When <action> Then <observable outcome>",
    "- **AC1** Given a repo When I build Then it succeeds",
  );
  task = task.replace(
    "<!-- Append-only journal. Filled only during /microspec.execute. -->",
    "Done.",
  );
  return task;
}

describe("reportTask — ok path", () => {
  it("returns ok=true with header for a valid task", () => {
    const report = reportTask(validTask());
    assert.equal(report.ok, true);
    assert.ok(report.header);
    assert.equal(report.header.status, "draft");
    assert.equal(report.violations.length, 0);
  });
});

describe("reportTask — violations path", () => {
  it("returns ok=false with violations for missing sections", () => {
    const raw = [
      "---",
      "status: draft",
      "created: 2025-06-01T00:00:00Z",
      "updated: 2025-06-01T00:00:00Z",
      "---",
      "",
      "# Minimal",
      "",
      "## Goal",
      "",
      "Some goal",
    ].join("\n");
    const report = reportTask(raw);
    assert.equal(report.ok, false);
    assert.ok(report.header);
    assert.ok(report.violations.length > 0);
  });
});

describe("reportTask — parse error path", () => {
  it("returns ok=false with parse-prefixed violation when frontmatter is missing", () => {
    const report = reportTask("no frontmatter here");
    assert.equal(report.ok, false);
    assert.equal(report.header, undefined);
    assert.ok(report.violations.length >= 1);
    assert.ok(report.violations[0]!.startsWith("parse: "));
  });
});

describe("formatTaskReport", () => {
  it("formats VALID line for ok report without id", () => {
    const report = reportTask(validTask());
    const text = formatTaskReport(report);
    assert.equal(text, "VALID status=draft");
  });

  it("formats INVALID line with numbered violations", () => {
    const report: TaskFileReport = {
      ok: false,
      violations: [
        "Goal: must not be empty",
        "Plan: must contain at least one step",
      ],
    };
    const text = formatTaskReport(report);
    const lines = text.split("\n");
    assert.equal(lines[0], "INVALID 2 violation(s):");
    assert.equal(lines[1], "1. Goal: must not be empty");
    assert.equal(lines[2], "2. Plan: must contain at least one step");
  });

  it("formats parse error report", () => {
    const report = reportTask("garbage");
    const text = formatTaskReport(report);
    assert.match(text, /^INVALID \d+ violation\(s\):/);
    assert.ok(text.includes("parse: "));
  });
});
