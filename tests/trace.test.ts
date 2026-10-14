// Tests for core/trace.ts — formatTraceArg, formatDuration, formatTraceLine,
// formatWritingTail and the renderTrace window.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TRACE_ARG_MAX,
  TRACE_MAX_VISIBLE_LINES,
  formatDuration,
  formatTraceArg,
  formatTraceLine,
  formatWritingTail,
  renderTrace,
  type TraceEntry,
} from "../core/trace.ts";

describe("formatTraceArg", () => {
  it("renders read args as path:lines (golden)", () => {
    assert.equal(
      formatTraceArg("read", {
        path: "src/routes/health.ts",
        offset: 1,
        limit: 40,
      }),
      "src/routes/health.ts:1-40",
    );
  });

  it("renders edit args as path:lines when offset/limit are present", () => {
    assert.equal(
      formatTraceArg("edit", {
        path: "core/trace.ts",
        offset: 10,
        limit: 5,
      }),
      "core/trace.ts:10-14",
    );
  });

  it("renders file tools without a numeric range as bare path", () => {
    assert.equal(
      formatTraceArg("edit", { path: "core/trace.ts", oldText: "a" }),
      "core/trace.ts",
    );
  });

  it("keeps string args verbatim for other tools", () => {
    assert.equal(formatTraceArg("bash", "npm test"), "npm test");
  });

  it("renders bash args as the command payload, not JSON (golden)", () => {
    assert.equal(
      formatTraceArg("bash", {
        command: "npm test -- --test-name-pattern health",
      }),
      "npm test -- --test-name-pattern health",
    );
    assert.equal(
      formatTraceArg("bash", { command: "curl -s localhost:3000/health" }),
      "curl -s localhost:3000/health",
    );
  });

  it("keeps only the first line of a multi-line bash command", () => {
    assert.equal(
      formatTraceArg("bash", { command: "line one\nline two" }),
      "line one",
    );
  });

  it("truncates a long bash command at TRACE_ARG_MAX chars", () => {
    const result = formatTraceArg("bash", { command: "x".repeat(80) });
    assert.equal(result, `${"x".repeat(60)}…`);
  });

  it("renders write args as the path", () => {
    assert.equal(
      formatTraceArg("write", { path: "core/trace.ts", content: "export …" }),
      "core/trace.ts",
    );
  });

  it("renders grep args as the pattern", () => {
    assert.equal(
      formatTraceArg("grep", { pattern: "TODO", path: "src", limit: 100 }),
      "TODO",
    );
  });

  it("renders ls args as the path", () => {
    assert.equal(formatTraceArg("ls", { path: "src/routes" }), "src/routes");
  });

  it("falls back to the single string field for unmapped tools", () => {
    assert.equal(
      formatTraceArg("some_mcp_tool", { target: "db://users", retries: 3 }),
      "db://users",
    );
  });

  it("falls back to compact JSON when no single string field exists", () => {
    assert.equal(
      formatTraceArg("some_mcp_tool", { a: "one", b: "two" }),
      '{"a":"one","b":"two"}',
    );
    assert.equal(formatTraceArg("some_mcp_tool", { limit: 5 }), '{"limit":5}');
  });

  it("falls back gracefully when a mapped field is missing or not a string", () => {
    // `ls` without a path: no string field at all -> compact JSON.
    assert.equal(formatTraceArg("ls", { limit: 50 }), '{"limit":50}');
    // `bash` with a non-string command but one other string field.
    assert.equal(formatTraceArg("bash", { command: 42, cwd: "/tmp" }), "/tmp");
  });

  it("keeps only the first line of a multi-line arg", () => {
    assert.equal(formatTraceArg("bash", "line one\nline two"), "line one");
  });

  it("truncates at TRACE_ARG_MAX chars with a trailing ellipsis (golden)", () => {
    const long = "x".repeat(80);
    const result = formatTraceArg("bash", long);
    assert.equal(result, `${"x".repeat(60)}…`);
    assert.equal([...result].length, TRACE_ARG_MAX + 1);
  });

  it("does not truncate args of exactly TRACE_ARG_MAX chars", () => {
    const exact = "y".repeat(TRACE_ARG_MAX);
    assert.equal(formatTraceArg("bash", exact), exact);
  });
});

describe("formatDuration", () => {
  it("formats sub-second durations in ms (golden)", () => {
    assert.equal(formatDuration(340), "340ms");
  });

  it("formats durations at or above one second in tenths (golden)", () => {
    assert.equal(formatDuration(6400), "6.4s");
    assert.equal(formatDuration(1000), "1.0s");
  });

  it("renders the in-progress placeholder for null", () => {
    assert.equal(formatDuration(null), "…");
  });
});

describe("formatTraceLine", () => {
  const entry = (overrides: Partial<TraceEntry>): TraceEntry => ({
    toolCallId: "call-1",
    tool: "bash",
    arg: "npm test",
    durationMs: null,
    status: "running",
    ...overrides,
  });

  it("formats a running line (golden)", () => {
    assert.equal(
      formatTraceLine(
        entry({
          tool: "read",
          arg: formatTraceArg("read", {
            path: "src/routes/health.ts",
            offset: 1,
            limit: 40,
          }),
        }),
      ),
      "read src/routes/health.ts:1-40 … running",
    );
  });

  it("formats an ok line (golden)", () => {
    assert.equal(
      formatTraceLine(
        entry({
          tool: "read",
          arg: formatTraceArg("read", {
            path: "src/routes/health.ts",
            offset: 1,
            limit: 40,
          }),
          durationMs: 340,
          status: "ok",
        }),
      ),
      "read src/routes/health.ts:1-40 340ms ok",
    );
  });

  it("formats a FAIL line (golden)", () => {
    assert.equal(
      formatTraceLine(
        entry({
          tool: "bash",
          arg: formatTraceArg("bash", "npm test"),
          durationMs: 6400,
          status: "FAIL",
        }),
      ),
      "bash npm test 6.4s FAIL",
    );
  });
});

describe("formatWritingTail", () => {
  it("renders the golden tail with en-US digit grouping", () => {
    assert.equal(formatWritingTail(1214), "writing report… (1,214 chars)");
  });

  it("groups every third digit for larger counts", () => {
    assert.equal(formatWritingTail(1000), "writing report… (1,000 chars)");
    assert.equal(
      formatWritingTail(1234567),
      "writing report… (1,234,567 chars)",
    );
  });

  it("leaves counts below 1000 ungrouped", () => {
    assert.equal(formatWritingTail(999), "writing report… (999 chars)");
    assert.equal(formatWritingTail(0), "writing report… (0 chars)");
  });
});

describe("renderTrace", () => {
  const entries = (count: number): TraceEntry[] =>
    Array.from({ length: count }, (_, index) => ({
      toolCallId: `call-${index + 1}`,
      tool: "bash",
      arg: `cmd-${String(index + 1).padStart(2, "0")}`,
      durationMs: 340,
      status: "ok" as const,
    }));

  const formatted = (all: readonly TraceEntry[]): string[] =>
    all.slice(-TRACE_MAX_VISIBLE_LINES).map((entry) => formatTraceLine(entry));

  it("keeps an 8-line window", () => {
    assert.equal(TRACE_MAX_VISIBLE_LINES, 8);
  });

  it("collapses 11 entries behind the golden `… 3 more` counter", () => {
    const lines = renderTrace(entries(11)).split("\n");
    assert.equal(lines[0], "… 3 more");
    assert.equal(lines.length, TRACE_MAX_VISIBLE_LINES + 1);
    assert.deepEqual(lines.slice(1), formatted(entries(11)));
  });

  it("renders only the last 8 of 11 entries", () => {
    const rendered = renderTrace(entries(11));
    const lines = rendered.split("\n");
    assert.equal(lines[1], "bash cmd-04 340ms ok");
    assert.equal(lines[TRACE_MAX_VISIBLE_LINES], "bash cmd-11 340ms ok");
    for (const hidden of ["cmd-01", "cmd-02", "cmd-03"]) {
      assert.equal(rendered.includes(hidden), false);
    }
  });

  it("renders `… 4 more` plus exactly 8 entry lines for 12 entries", () => {
    const all = entries(12);
    const lines = renderTrace(all).split("\n");
    assert.equal(lines[0], "… 4 more");
    assert.equal(lines.slice(1).length, TRACE_MAX_VISIBLE_LINES);
    assert.deepEqual(lines.slice(1), formatted(all));
  });

  it("omits the counter at or below the window size", () => {
    const eight = renderTrace(entries(TRACE_MAX_VISIBLE_LINES));
    assert.equal(eight.split("\n").length, TRACE_MAX_VISIBLE_LINES);
    assert.equal(eight.includes("more"), false);
    assert.equal(renderTrace(entries(3)).split("\n").length, 3);
  });

  it("returns an empty string without entries or writing progress", () => {
    assert.equal(renderTrace([]), "");
  });

  it("appends the writing tail as the last line", () => {
    const lines = renderTrace(entries(2), 1214).split("\n");
    assert.equal(lines[lines.length - 1], "writing report… (1,214 chars)");
    assert.equal(lines.length, 3);
  });

  it("omits the tail for null, undefined and zero chars", () => {
    const line = "bash cmd-01 340ms ok";
    assert.equal(renderTrace(entries(1), null), line);
    assert.equal(renderTrace(entries(1), undefined), line);
    assert.equal(renderTrace(entries(1)), line);
    assert.equal(renderTrace(entries(1), 0), line);
  });

  it("renders the tail alone while writing with no entries yet", () => {
    assert.equal(renderTrace([], 42), "writing report… (42 chars)");
  });

  it("keeps a running entry inside the window", () => {
    const running: TraceEntry = {
      toolCallId: "call-9",
      tool: "read",
      arg: formatTraceArg("read", {
        path: "src/routes/health.ts",
        offset: 1,
        limit: 40,
      }),
      durationMs: null,
      status: "running",
    };
    const lines = renderTrace([...entries(9).slice(0, 8), running], 512).split(
      "\n",
    );
    assert.equal(lines[0], "… 1 more");
    assert.equal(lines[8], "read src/routes/health.ts:1-40 … running");
    assert.equal(lines[9], "writing report… (512 chars)");
  });

  it("joins counter, window and tail with newlines (golden)", () => {
    const all = entries(11);
    assert.equal(
      renderTrace(all, 1214),
      ["… 3 more", ...formatted(all), "writing report… (1,214 chars)"].join(
        "\n",
      ),
    );
  });
});
