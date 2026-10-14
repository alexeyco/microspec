// TASK.md contract: constants, template rendering, parsing, and validation.
// The section table and validation rules are canonical per the design spec.

import { parseMarkdown, type ParsedMarkdown } from "./markdown.ts";

export const TASK_FILENAME = "TASK.md";

export type TaskStatus = "draft" | "ready" | "in_progress" | "blocked" | "done";

export const TASK_STATUSES: readonly TaskStatus[] = [
  "draft",
  "ready",
  "in_progress",
  "blocked",
  "done",
];

export const REQUIRED_SECTIONS = [
  "Goal",
  "Non-goals",
  "Context",
  "Plan",
  "Guardrails",
  "Acceptance criteria",
  "Result",
] as const;

export interface TaskHeader {
  readonly status: TaskStatus;
  readonly created: string;
  readonly updated: string;
}

export interface ParsedTask {
  readonly header: TaskHeader;
  readonly title: string;
  readonly sections: Readonly<Record<string, string>>;
}

export function renderTaskDraft(input: {
  readonly created: string;
  readonly title: string;
}): string {
  const lines: string[] = [
    "---",
    "status: draft",
    `created: ${input.created}`,
    `updated: ${input.created}`,
    "---",
    "",
    `# ${input.title}`,
    "",
    "## Goal",
    "",
    "<One paragraph: the desired end state. No implementation plan.>",
    "",
    "## Non-goals",
    "",
    '- <Out of scope. Never leave empty; write "None" if there is truly nothing.>',
    "",
    "## Context",
    "",
    "- <Verifiable facts only: file paths, commands, versions, observed behavior.>",
    "",
    "## Plan",
    "",
    "- [ ] **S1** <step summary> (deps: —)",
    "  - Owner: microspec-implementer",
    "  - Evidence: <command/output/artifact proving the step is complete>",
    "",
    "## Guardrails",
    "",
    "- <Short imperative prohibition or stop point. No explanations.>",
    "",
    "## Acceptance criteria",
    "",
    "- **AC1** Given <state> When <action> Then <observable outcome>",
    "",
    "## Result",
    "",
    "<!-- Append-only journal. Filled only during /microspec.execute. -->",
    "",
  ];
  return lines.join("\n");
}

// Strip HTML comments and whitespace for emptiness checks.
function stripCommentsAndWhitespace(text: string): string {
  const noComments = text.replace(/<!--[\s\S]*?-->/g, "");
  return noComments.trim();
}

// Parse a TASK.md string into header, title, and sections.
export function parseTask(raw: string): ParsedTask {
  let parsed: ParsedMarkdown<unknown>;
  try {
    parsed = parseMarkdown<unknown>(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`task: ${msg}`);
  }

  const fm = parsed.frontmatter as Record<string, unknown>;
  if (!fm || typeof fm !== "object") {
    throw new Error("task: frontmatter must be an object");
  }

  const status = typeof fm.status === "string" ? fm.status : "";
  const created = typeof fm.created === "string" ? fm.created : "";
  const updated = typeof fm.updated === "string" ? fm.updated : "";

  const header: TaskHeader = {
    status: status as TaskStatus,
    created,
    updated,
  };

  // Extract title: first H1 line
  const body = parsed.body;
  const h1Match = body.match(/^# (.+)$/m);
  const title = h1Match ? h1Match[1]!.trim() : "";

  // Extract H2 sections — tolerate multiple spaces after ## and trailing
  // whitespace on the heading line. Section boundaries are taken directly
  // from the heading match offsets so a misformatted heading cannot cause
  // a section to swallow the rest of the document.
  const sections: Record<string, string> = {};
  const h2Re = /^##\s+(.+)$/gm;
  const h2Matches: { name: string; contentStart: number; lineStart: number }[] =
    [];
  let m: RegExpExecArray | null;
  while ((m = h2Re.exec(body)) !== null) {
    h2Matches.push({
      name: m[1]!.trim(),
      contentStart: m.index + m[0].length,
      lineStart: m.index,
    });
  }
  for (const [i, sec] of h2Matches.entries()) {
    const sectionEnd =
      i + 1 < h2Matches.length ? h2Matches[i + 1]!.lineStart : body.length;
    sections[sec.name] = body.slice(sec.contentStart, sectionEnd);
  }

  return { header, title, sections };
}

// Validate a raw TASK.md string. Returns an array of violation strings;
// empty array means valid.
export function validateTask(raw: string): string[] {
  const violations: string[] = [];

  // 1. Header parses; created, updated non-empty; status in vocabulary.
  let parsed: ParsedTask;
  try {
    parsed = parseTask(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    violations.push(`Header: ${msg}`);
    return violations;
  }

  const { header, sections } = parsed;

  if (!header.created) {
    violations.push("Header: 'created' must not be empty");
  }
  if (!header.updated) {
    violations.push("Header: 'updated' must not be empty");
  }
  if (!header.status || !TASK_STATUSES.includes(header.status)) {
    violations.push(
      `Header: 'status' must be one of ${TASK_STATUSES.join(", ")}`,
    );
  }

  // 2. All REQUIRED_SECTIONS present
  for (const name of REQUIRED_SECTIONS) {
    if (!(name in sections)) {
      violations.push(`${name}: section missing`);
    }
  }

  // 3. Goal, Non-goals, Context, Guardrails non-empty
  const nonEmptySections = [
    "Goal",
    "Non-goals",
    "Context",
    "Guardrails",
  ] as const;
  for (const name of nonEmptySections) {
    const content = sections[name];
    if (content === undefined) continue; // already reported above
    if (stripCommentsAndWhitespace(content) === "") {
      if (name === "Non-goals") {
        violations.push(
          'Non-goals must not be empty; write "None" when there are none',
        );
      } else {
        violations.push(`${name}: must not be empty`);
      }
    }
  }

  // 4. Acceptance criteria: ≥1 bullet; every bullet contains Given, When, Then
  const acContent = sections["Acceptance criteria"];
  if (acContent !== undefined) {
    const stripped = stripCommentsAndWhitespace(acContent);
    if (stripped !== "") {
      // Find bullet lines (lines starting with - or *)
      const bulletLines: string[] = [];
      const lines = acContent.split("\n");
      for (const line of lines) {
        if (/^\s*[-*]\s/.test(line)) {
          bulletLines.push(line);
        }
      }
      if (bulletLines.length === 0) {
        violations.push(
          "Acceptance criteria: must contain at least one bullet",
        );
      } else {
        for (const [i, bullet] of bulletLines.entries()) {
          const hasGiven = /\bgiven\b/i.test(bullet);
          const hasWhen = /\bwhen\b/i.test(bullet);
          const hasThen = /\bthen\b/i.test(bullet);
          if (!hasGiven || !hasWhen || !hasThen) {
            violations.push(
              `Acceptance criteria: bullet ${i + 1} must contain Given, When, Then`,
            );
          }
        }
      }
    } else {
      violations.push("Acceptance criteria: must contain at least one bullet");
    }
  }

  // 5. Plan: ≥1 step (- [ checkbox line); every step block contains Owner: and Evidence:
  const planContent = sections["Plan"];
  if (planContent !== undefined) {
    const planStripped = stripCommentsAndWhitespace(planContent);
    if (planStripped !== "") {
      // Find checkbox lines: "- [ ]" or "- [x]"
      const checkboxRe = /^\s*- \[[ xX]\]/gm;
      const checkboxMatches: { index: number }[] = [];
      let cm: RegExpExecArray | null;
      while ((cm = checkboxRe.exec(planContent)) !== null) {
        checkboxMatches.push({ index: cm.index });
      }
      if (checkboxMatches.length === 0) {
        violations.push(
          "Plan: must contain at least one step (- [ ] checkbox)",
        );
      } else {
        // For each step, find the block until the next step or end
        for (const [i, match] of checkboxMatches.entries()) {
          const blockStart = match.index;
          const blockEnd =
            i + 1 < checkboxMatches.length
              ? checkboxMatches[i + 1]!.index
              : planContent.length;
          const block = planContent.slice(blockStart, blockEnd);
          if (!/Owner:/i.test(block)) {
            violations.push(`Plan: step ${i + 1} must contain 'Owner:'`);
          }
          if (!/Evidence:/i.test(block)) {
            violations.push(`Plan: step ${i + 1} must contain 'Evidence:'`);
          }
        }
      }
    } else {
      violations.push("Plan: must contain at least one step (- [ ] checkbox)");
    }
  }

  // 6. Result: violation when status: done and Result empty
  if (header.status === "done") {
    const resultContent = sections["Result"];
    if (resultContent !== undefined) {
      if (stripCommentsAndWhitespace(resultContent) === "") {
        violations.push("Result: must not be empty when status is done");
      }
    }
  }

  return violations;
}

// ── Structured report ──────────────────────────────────────────────────────

export interface TaskFileReport {
  readonly ok: boolean;
  readonly header?: TaskHeader;
  readonly violations: readonly string[];
}

// Parse + validate a raw TASK.md string and return a structured report.
// Parse errors become violations prefixed with "parse: ".
export function reportTask(raw: string): TaskFileReport {
  const violations: string[] = [];
  let header: TaskHeader | undefined;

  try {
    const parsed = parseTask(raw);
    header = parsed.header;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    violations.push(`parse: ${msg}`);
    return { ok: false, violations };
  }

  const v = validateTask(raw);
  violations.push(...v);

  return { ok: violations.length === 0, header, violations };
}

// Format a TaskFileReport into the text returned by microspec_validate_task.
export function formatTaskReport(report: TaskFileReport): string {
  if (report.ok && report.header) {
    return `VALID status=${report.header.status}`;
  }
  const lines: string[] = [`INVALID ${report.violations.length} violation(s):`];
  for (const [i, v] of report.violations.entries()) {
    lines.push(`${i + 1}. ${v}`);
  }
  return lines.join("\n");
}
