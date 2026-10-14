// Tests for createTraceTracker (pi/task-tool.ts) — session-free, driven by a
// stubbed AgentSessionEvent array, a fake clock and a recording onUpdate.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { truncateToVisualLines } from "@earendil-works/pi-coding-agent";
import type {
  AgentSessionEvent,
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionToolContext,
} from "@earendil-works/pi-coding-agent";
import { formatTraceLine } from "../core/trace.ts";
import {
  createTaskTool,
  createTraceTracker,
  type TaskDetails,
} from "../pi/task-tool.ts";
import type { RoleAsset } from "../core/roles.ts";

// ---------- stub event builders ----------

function toolStart(
  toolCallId: string,
  toolName: string,
  args: unknown,
): AgentSessionEvent {
  return { type: "tool_execution_start", toolCallId, toolName, args };
}

function toolEnd(
  toolCallId: string,
  toolName: string,
  isError: boolean,
  durationMs: number | undefined,
): AgentSessionEvent {
  return {
    type: "tool_execution_end",
    toolCallId,
    toolName,
    result: undefined,
    isError,
    durationMs,
  };
}

// `text_delta` demands a full AssistantMessage as `partial` (provider, model,
// usage, timestamps) which the tracker never reads; the stub carries only the
// fields `handleEvent` inspects.
function textDelta(delta: string): AgentSessionEvent {
  return {
    type: "message_update",
    message: { role: "assistant" },
    assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta },
  } as unknown as AgentSessionEvent;
}

function assistantMessageStart(): AgentSessionEvent {
  return {
    type: "message_start",
    message: { role: "assistant" },
  } as unknown as AgentSessionEvent;
}

// ---------- helpers ----------

const ROLE = "microspec-implementer";

function recorder() {
  const partials: AgentToolResult<TaskDetails>[] = [];
  const onUpdate = (partial: AgentToolResult<TaskDetails>) => {
    partials.push(partial);
  };
  return { partials, onUpdate };
}

function fakeClock(start = 0) {
  let at = start;
  return {
    now: () => at,
    advance(ms: number) {
      at += ms;
    },
  };
}

function traceEvents(count: number): AgentSessionEvent[] {
  const events: AgentSessionEvent[] = [];
  for (let index = 0; index < count; index += 1) {
    events.push(toolStart(`call_${index}`, "read", { path: `f${index}.ts` }));
    events.push(toolEnd(`call_${index}`, "read", false, 100 + index));
  }
  return events;
}

describe("createTraceTracker: tool_execution_start", () => {
  it("emits immediately with a running entry as the last trace item", () => {
    const { partials, onUpdate } = recorder();
    const tracker = createTraceTracker({ role: ROLE, onUpdate });

    assert.equal(partials.length, 0);
    tracker.handleEvent(
      toolStart("call_1", "read", {
        path: "src/routes/health.ts",
        offset: 1,
        limit: 40,
      }),
    );

    // Emitted synchronously, before any subsequent event is handled.
    assert.equal(partials.length, 1);
    const first = partials.at(0);
    assert.ok(first, "expected one emitted partial");
    assert.equal(first.details.role, ROLE);
    assert.equal(first.details.writingChars, null);

    const entry = first.details.trace.at(0);
    assert.ok(entry, "expected one trace entry");
    assert.equal(entry.toolCallId, "call_1");
    assert.equal(entry.tool, "read");
    assert.equal(entry.arg, "src/routes/health.ts:1-40");
    assert.equal(entry.durationMs, null);
    assert.equal(entry.status, "running");
  });

  it("keeps emitted partials as snapshots of the state at emit time", () => {
    const { partials, onUpdate } = recorder();
    const tracker = createTraceTracker({ role: ROLE, onUpdate });

    tracker.handleEvent(toolStart("call_1", "bash", { command: "npm test" }));
    const first = partials.at(0);
    assert.ok(first, "expected one emitted partial");

    tracker.handleEvent(toolEnd("call_1", "bash", false, 340));
    assert.equal(first.details.trace.at(0)?.status, "running");
    assert.equal(partials.at(1)?.details.trace.at(0)?.status, "ok");
  });

  it("emits one partial per tool event, in order", () => {
    const { partials, onUpdate } = recorder();
    const tracker = createTraceTracker({ role: ROLE, onUpdate });

    for (const event of [
      toolStart("a", "read", { path: "a.ts" }),
      toolStart("b", "grep", { pattern: "TODO" }),
      toolEnd("a", "read", false, 12),
      toolEnd("b", "grep", true, 30),
    ]) {
      tracker.handleEvent(event);
    }

    assert.equal(partials.length, 4);
    assert.deepEqual(
      partials.at(3)?.details.trace.map((entry) => entry.status),
      ["ok", "FAIL"],
    );
    assert.equal(tracker.entries().length, 2);
  });
});

describe("createTraceTracker: tool_execution_end", () => {
  it("closes the entry as ok with the event's own durationMs", () => {
    const { partials, onUpdate } = recorder();
    const tracker = createTraceTracker({ role: ROLE, onUpdate });

    tracker.handleEvent(
      toolStart("call_1", "read", {
        path: "src/routes/health.ts",
        offset: 1,
        limit: 40,
      }),
    );
    tracker.handleEvent(toolEnd("call_1", "read", false, 340));

    const entry = tracker.details().trace.at(0);
    assert.ok(entry, "expected one trace entry");
    assert.equal(entry.status, "ok");
    assert.equal(entry.durationMs, 340);

    const last = partials.at(1);
    assert.ok(last, "expected a second emitted partial");
    assert.equal(last.details.trace.at(0)?.status, "ok");
    assert.equal(last.details.trace.at(0)?.durationMs, 340);
    assert.equal(tracker.render(), "read src/routes/health.ts:1-40 340ms ok");
  });

  it("closes the entry as FAIL with the event's own durationMs", () => {
    const { onUpdate } = recorder();
    const tracker = createTraceTracker({ role: ROLE, onUpdate });

    tracker.handleEvent(toolStart("call_1", "bash", { command: "make check" }));
    tracker.handleEvent(toolEnd("call_1", "bash", true, 6400));

    const entry = tracker.details().trace.at(0);
    assert.ok(entry, "expected one trace entry");
    assert.equal(entry.status, "FAIL");
    assert.equal(entry.durationMs, 6400);
    assert.equal(tracker.render(), "bash make check 6.4s FAIL");
  });

  it("keeps durationMs null when the event carries no duration", () => {
    const tracker = createTraceTracker({ role: ROLE });
    tracker.handleEvent(toolStart("call_1", "read", { path: "a.ts" }));
    tracker.handleEvent(toolEnd("call_1", "read", false, undefined));

    assert.equal(tracker.details().trace.at(0)?.durationMs, null);
    assert.equal(tracker.render(), "read a.ts … ok");
  });

  it("ignores an end event without a matching start", () => {
    const { partials, onUpdate } = recorder();
    const tracker = createTraceTracker({ role: ROLE, onUpdate });

    tracker.handleEvent(toolEnd("unknown", "read", false, 10));

    assert.equal(partials.length, 0);
    assert.equal(tracker.entries().length, 0);
  });
});

describe("createTraceTracker: text_delta throttling", () => {
  it("emits at most once per 5000 ms of injected now() time", () => {
    const clock = fakeClock(0);
    const { partials, onUpdate } = recorder();
    const tracker = createTraceTracker({
      role: ROLE,
      onUpdate,
      now: clock.now,
    });

    tracker.handleEvent(textDelta("hello")); // t=0 -> emits
    clock.advance(1000);
    tracker.handleEvent(textDelta(" world")); // t=1000 -> throttled
    clock.advance(1000);
    tracker.handleEvent(textDelta("!")); // t=2000 -> throttled

    assert.equal(partials.length, 1);
    assert.equal(partials.at(0)?.details.writingChars, 5);
    // Text accumulates even while the emission is throttled.
    assert.equal(tracker.text(), "hello world!");
    assert.equal(tracker.details().writingChars, 12);
    assert.equal(tracker.render(), "writing report… (12 chars)");

    clock.advance(3000); // t=5000 -> window elapsed
    tracker.handleEvent(textDelta(" ok"));
    assert.equal(partials.length, 2);
    assert.equal(partials.at(1)?.details.writingChars, 15);
    assert.equal(tracker.text(), "hello world! ok");
  });

  it("honours a custom throttleMs", () => {
    const clock = fakeClock(1_000);
    const { partials, onUpdate } = recorder();
    const tracker = createTraceTracker({
      role: ROLE,
      onUpdate,
      now: clock.now,
      throttleMs: 100,
    });

    tracker.handleEvent(textDelta("a")); // t=1000 -> emits
    clock.advance(99);
    tracker.handleEvent(textDelta("b")); // t=1099 -> throttled
    clock.advance(1);
    tracker.handleEvent(textDelta("c")); // t=1100 -> emits

    assert.equal(partials.length, 2);
    assert.equal(tracker.text(), "abc");
  });

  it("resets the accumulated text on a new assistant message", () => {
    const tracker = createTraceTracker({ role: ROLE });

    tracker.handleEvent(textDelta("thinking out loud"));
    tracker.handleEvent(assistantMessageStart());
    assert.equal(tracker.text(), "");
    assert.equal(tracker.details().writingChars, null);

    tracker.handleEvent(textDelta("the report"));
    assert.equal(tracker.text(), "the report");
    assert.equal(tracker.details().writingChars, 10);
  });

  it("does not throttle tool events that follow text deltas", () => {
    const clock = fakeClock(0);
    const { partials, onUpdate } = recorder();
    const tracker = createTraceTracker({
      role: ROLE,
      onUpdate,
      now: clock.now,
    });

    tracker.handleEvent(textDelta("draft")); // t=0 -> emits (writing)
    tracker.handleEvent(toolStart("call_1", "read", { path: "a.ts" }));
    tracker.handleEvent(toolEnd("call_1", "read", false, 5));

    assert.equal(partials.length, 3);
    assert.equal(partials.at(2)?.details.trace.at(0)?.status, "ok");
    assert.equal(partials.at(2)?.details.writingChars, 5);
  });
});

describe("createTraceTracker: unrelated events", () => {
  it("emits nothing for event types it does not consume", () => {
    const { partials, onUpdate } = recorder();
    const tracker = createTraceTracker({ role: ROLE, onUpdate });

    const events: AgentSessionEvent[] = [
      { type: "agent_start" },
      { type: "turn_start" },
      assistantMessageStart(),
      {
        type: "tool_execution_update",
        toolCallId: "call_1",
        toolName: "bash",
        args: { command: "npm test" },
        partialResult: { content: [], details: undefined },
      },
      { type: "queue_update", steering: [], followUp: [] },
      { type: "agent_settled", aborted: false },
    ];
    for (const event of events) {
      tracker.handleEvent(event);
    }

    assert.equal(partials.length, 0);
    assert.equal(tracker.entries().length, 0);
    assert.equal(tracker.text(), "");
    assert.equal(tracker.details().writingChars, null);
    assert.equal(tracker.render(), "");
  });
});

describe("createTraceTracker: markAborted", () => {
  it("closes a lone in-flight entry as FAIL with a null duration", () => {
    const { partials, onUpdate } = recorder();
    const tracker = createTraceTracker({ role: ROLE, onUpdate });

    // A start with no matching end: the child was interrupted mid-call.
    tracker.handleEvent(toolStart("call_1", "bash", { command: "npm test" }));
    tracker.markAborted();

    const details = tracker.details();
    assert.equal(details.trace.length, 1);
    const first = details.trace.at(0);
    assert.ok(first, "expected one trace entry");
    assert.equal(first.status, "FAIL");
    assert.equal(first.durationMs, null);
    // markAborted emits nothing: Pi ignores updates sent after the settle.
    assert.equal(partials.length, 1);
    assert.equal(tracker.render(), "bash npm test … FAIL");
  });

  it("closes in-flight entries as FAIL without a duration", () => {
    const { partials, onUpdate } = recorder();
    const tracker = createTraceTracker({ role: ROLE, onUpdate });

    tracker.handleEvent(toolStart("call_1", "bash", { command: "make check" }));
    tracker.handleEvent(toolEnd("call_1", "bash", false, 12));
    tracker.handleEvent(toolStart("call_2", "read", { path: "core/trace.ts" }));
    tracker.markAborted();

    const details = tracker.details();
    assert.equal(details.trace.length, 2);
    assert.equal(details.trace.at(0)?.status, "ok");
    assert.equal(details.trace.at(0)?.durationMs, 12);
    assert.equal(details.trace.at(1)?.status, "FAIL");
    assert.equal(details.trace.at(1)?.durationMs, null);
    // markAborted does not emit: the tool returns its own result right after.
    assert.equal(partials.length, 3);
    assert.equal(
      tracker.render(),
      ["bash make check 12ms ok", "read core/trace.ts … FAIL"].join("\n"),
    );
  });
});

describe("microspec_task: onUpdate callback contract", () => {
  it("streams partials whose details.role is the role id and whose writingChars grows", () => {
    const clock = fakeClock(0);
    const partials: AgentToolResult<TaskDetails>[] = [];
    // Typed exactly as execute's 4th parameter: the tracker must accept the
    // runtime callback without adaptation.
    const onUpdate: AgentToolUpdateCallback<TaskDetails> = (partial) => {
      partials.push(partial);
    };
    const tracker = createTraceTracker({
      role: ROLE,
      onUpdate,
      now: clock.now,
    });

    tracker.handleEvent(toolStart("call_1", "read", { path: "core/trace.ts" }));
    tracker.handleEvent(toolEnd("call_1", "read", false, 12));
    tracker.handleEvent(textDelta("report ")); // t=0 -> emits
    clock.advance(5000);
    tracker.handleEvent(textDelta("line two ")); // t=5000 -> emits
    clock.advance(5000);
    tracker.handleEvent(textDelta("done")); // t=10000 -> emits

    for (const partial of partials) {
      assert.equal(partial.details.role, ROLE);
    }
    assert.deepEqual(
      partials.map((partial) => partial.details.writingChars),
      [null, null, 7, 16, 20],
    );
    assert.equal(tracker.text(), "report line two done");
    assert.equal(tracker.text().length, 20);
    assert.deepEqual(partials.at(4)?.details.trace.at(0), {
      toolCallId: "call_1",
      tool: "read",
      arg: "core/trace.ts",
      durationMs: 12,
      status: "ok",
    });
  });
});

describe("microspec_task: result details (AC9)", () => {
  it("pairs the child's report text with { role, trace, writingChars } details", () => {
    const tracker = createTraceTracker({ role: ROLE });

    tracker.handleEvent(toolStart("call_1", "read", { path: "core/trace.ts" }));
    tracker.handleEvent(toolEnd("call_1", "read", false, 12));
    tracker.handleEvent(assistantMessageStart());
    tracker.handleEvent(textDelta("DONE: step complete."));

    // Exactly the object execute returns on the success path: the report text
    // in content, the tracker snapshot in details.
    const finalText = tracker.text();
    const result: AgentToolResult<TaskDetails> = {
      content: [{ type: "text", text: finalText }],
      details: tracker.details(),
    };

    assert.deepEqual(result.content, [
      { type: "text", text: "DONE: step complete." },
    ]);
    assert.deepEqual(Object.keys(result.details).sort(), [
      "role",
      "trace",
      "writingChars",
    ]);
    assert.deepEqual(result.details, {
      role: ROLE,
      trace: [
        {
          toolCallId: "call_1",
          tool: "read",
          arg: "core/trace.ts",
          durationMs: 12,
          status: "ok",
        },
      ],
      writingChars: 20,
    });
  });

  it("execute returns empty-trace details when aborted before the session starts", async () => {
    const role: RoleAsset = {
      id: ROLE,
      path: `agents/${ROLE}.md`,
      body: `# ${ROLE}\n\nDo the scoped work.`,
      description: "executes one plan step",
      mode: "subagent",
    };
    const tool = createTaskTool([role]);
    const partials: AgentToolResult<TaskDetails>[] = [];
    const onUpdate: AgentToolUpdateCallback<TaskDetails> = (partial) => {
      partials.push(partial);
    };

    // The pre-session abort return happens before ctx is read, so a stub is
    // enough; no child session is spawned.
    const ctx = {} as unknown as ExtensionToolContext;
    // createTaskTool returns the unparameterised ToolDefinition, whose TDetails
    // defaults to unknown; the callback actually passed at runtime is the
    // TaskDetails one declared above.
    const result = (await tool.execute(
      "call_parent_1",
      { role: ROLE, prompt: "execute S5" },
      AbortSignal.abort(),
      onUpdate as AgentToolUpdateCallback,
      ctx,
    )) as AgentToolResult<TaskDetails>;

    assert.equal(result.isError, true);
    assert.deepEqual(result.content, [{ type: "text", text: "aborted" }]);
    assert.deepEqual(result.details, {
      role: ROLE,
      trace: [],
      writingChars: null,
    });
    assert.equal(partials.length, 0);
  });

  it("pairs the aborted return with the tracker's FAIL-closed details", () => {
    // The post-bind aborted return of execute: same composition as the
    // success case above — "aborted" in content, the tracker snapshot in
    // details, isError set. Driven at tracker level because reaching that
    // return through the real execute needs a live child session.
    const tracker = createTraceTracker({ role: ROLE });

    tracker.handleEvent(toolStart("call_1", "read", { path: "core/trace.ts" }));
    tracker.handleEvent(toolEnd("call_1", "read", false, 12));
    tracker.handleEvent(textDelta("partial report"));
    tracker.handleEvent(toolStart("call_2", "bash", { command: "make check" }));

    tracker.markAborted();

    const result: AgentToolResult<TaskDetails> = {
      content: [{ type: "text", text: "aborted" }],
      details: tracker.details(),
      isError: true,
    };

    assert.equal(result.isError, true);
    assert.deepEqual(result.content, [{ type: "text", text: "aborted" }]);
    assert.deepEqual(result.details, {
      role: ROLE,
      trace: [
        {
          toolCallId: "call_1",
          tool: "read",
          arg: "core/trace.ts",
          durationMs: 12,
          status: "ok",
        },
        {
          toolCallId: "call_2",
          tool: "bash",
          arg: "make check",
          durationMs: null,
          status: "FAIL",
        },
      ],
      writingChars: 14,
    });
    assert.deepEqual(
      result.details.trace.map((entry) => entry.status),
      ["ok", "FAIL"],
    );
  });
});

describe("createTraceTracker: render", () => {
  it("renders the windowed trace with the writing tail", () => {
    const tracker = createTraceTracker({ role: ROLE });

    for (const event of traceEvents(11)) {
      tracker.handleEvent(event);
    }
    tracker.handleEvent(textDelta("x".repeat(1214)));

    const lines = tracker.render().split("\n");
    assert.equal(tracker.entries().length, 11);
    assert.equal(lines.at(0), "… 3 more");
    assert.equal(lines.length, 10);
    assert.equal(lines.at(1), "read f3.ts 103ms ok");
    assert.equal(lines.at(8), "read f10.ts 110ms ok");
    assert.equal(lines.at(9), "writing report… (1,214 chars)");
  });
});

describe("microspec_task: renderResult (AC10)", () => {
  it("draws the windowed trace above the report text", () => {
    const role: RoleAsset = {
      id: ROLE,
      path: `agents/${ROLE}.md`,
      body: `# ${ROLE}\n\nDo the scoped work.`,
      description: "executes one plan step",
      mode: "subagent",
    };
    const tool = createTaskTool([role]);

    // Build 11 trace entries via the tracker (no text delta, so writingChars is null).
    const tracker = createTraceTracker({ role: ROLE });
    for (const event of traceEvents(11)) {
      tracker.handleEvent(event);
    }

    const result: AgentToolResult<TaskDetails> = {
      content: [{ type: "text", text: "Report: step complete." }],
      details: tracker.details(),
    };

    // Minimal stubs for the parameters renderResult does not use.
    const options = { expanded: false, isPartial: false };
    const theme = {} as never;
    const context = {} as never;

    const component = tool.renderResult!(result, options, theme, context);
    const lines = component.render(80);

    // The trace block: … 3 more, then the last 8 entry lines.
    assert.equal(lines[0], "… 3 more");
    assert.equal(lines.length, 10); // 1 counter + 8 entries + 1 report line
    assert.equal(lines[1], "read f3.ts 103ms ok");
    assert.equal(lines[8], "read f10.ts 110ms ok");
    // The report text follows the trace block.
    assert.equal(lines[9], "Report: step complete.");
  });
});

describe("microspec_task: renderResult writing tail (Defect 2)", () => {
  const role: RoleAsset = {
    id: ROLE,
    path: `agents/${ROLE}.md`,
    body: `# ${ROLE}\n\nDo the scoped work.`,
    description: "executes one plan step",
    mode: "subagent",
  };
  const tool = createTaskTool([role]);

  function detailsWithWritingChars(): TaskDetails {
    const tracker = createTraceTracker({ role: ROLE });
    tracker.handleEvent(toolStart("call_1", "bash", { command: "npm test" }));
    tracker.handleEvent(toolEnd("call_1", "bash", false, 6400));
    tracker.handleEvent(textDelta("x".repeat(180)));
    const details = tracker.details();
    assert.equal(details.writingChars, 180);
    return details;
  }

  function rendered(details: TaskDetails, isPartial: boolean): string[] {
    const result: AgentToolResult<TaskDetails> = {
      content: [{ type: "text", text: "Report: step complete." }],
      details,
    };
    const component = tool.renderResult!(
      result,
      { expanded: false, isPartial },
      {} as never,
      {} as never,
    );
    return component.render(80);
  }

  it("draws the writing tail on a partial render", () => {
    const lines = rendered(detailsWithWritingChars(), true);
    assert.deepEqual(lines, [
      "bash npm test 6.4s ok",
      "writing report… (180 chars)",
      "Report: step complete.",
    ]);
  });

  it("omits the stale writing tail on the final render", () => {
    const lines = rendered(detailsWithWritingChars(), false);
    assert.deepEqual(lines, [
      "bash npm test 6.4s ok",
      "Report: step complete.",
    ]);
    assert.equal(
      lines.some((line) => line.includes("writing report")),
      false,
    );
  });

  it("keeps the trace block and writingChars data in both renders", () => {
    const details = detailsWithWritingChars();
    for (const isPartial of [true, false]) {
      const lines = rendered(details, isPartial);
      assert.equal(lines[0], "bash npm test 6.4s ok");
    }
    // Only the drawing is conditional — the data stays populated.
    assert.equal(details.writingChars, 180);
  });
});

// ---------- renderResult width clamping (S7 fix round 1) ----------

// pi-tui's `visibleWidth` is the host's measure, but pi-tui is not a declared
// dependency of this package, so the tests measure conservatively instead:
// strip ANSI escapes and count double-width (CJK/emoji) code points as 2.
// This overestimates at worst, keeping `<= width` assertions strict.
function stripAnsi(text: string): string {
  return text
    .replace(/\u001b\[[0-9;:]*[ -/]*[@-~]/g, "")
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "");
}

function isDoubleWidth(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

function conservativeWidth(line: string): number {
  let width = 0;
  for (const char of stripAnsi(line)) {
    width += isDoubleWidth(char.codePointAt(0) ?? 0) ? 2 : 1;
  }
  return width;
}

describe("microspec_task: renderResult width clamping", () => {
  const WIDTH = 80;

  const role: RoleAsset = {
    id: ROLE,
    path: `agents/${ROLE}.md`,
    body: `# ${ROLE}\n\nDo the scoped work.`,
    description: "executes one plan step",
    mode: "subagent",
  };
  const tool = createTaskTool([role]);

  function renderedLines(
    details: TaskDetails,
    reportText: string,
    width: number,
    expanded = false,
  ): string[] {
    const result: AgentToolResult<TaskDetails> = {
      content: [{ type: "text", text: reportText }],
      details,
    };
    const component = tool.renderResult!(
      result,
      { expanded, isPartial: false },
      {} as never,
      {} as never,
    );
    return component.render(width);
  }

  // Every returned line must fit the requested width by BOTH measures: the
  // conservative code-point measure and the host's own wrapping (a line that
  // fits is a single visual line at `width`).
  function assertEveryLineFits(lines: string[], width: number): void {
    for (const line of lines) {
      assert.ok(
        conservativeWidth(line) <= width,
        `line wider than ${width}: ${JSON.stringify(line)}`,
      );
      const { skippedCount } = truncateToVisualLines(
        line,
        1,
        width,
        0,
        "start",
      );
      assert.equal(
        skippedCount,
        0,
        `host measure wraps line at ${width}: ${JSON.stringify(line)}`,
      );
    }
  }

  it("clamps a >200-character report line to the requested width", () => {
    const lines = renderedLines(
      { role: ROLE, trace: [], writingChars: null },
      "y".repeat(271),
      WIDTH,
    );
    assertEveryLineFits(lines, WIDTH);
    // The overlong line wrapped into several fitting lines instead of
    // overflowing the terminal.
    assert.ok(lines.length > 1, "expected the long line to wrap");
  });

  it("clamps a 60-char truncated argument with a long tool name", () => {
    const longTool = "a_very_long_tool_name_"; // 22 columns
    const tracker = createTraceTracker({ role: ROLE });
    tracker.handleEvent(
      toolStart("call_1", longTool, {
        command:
          "make check && npm test --silent && node scripts/check.mjs && git status",
      }),
    );
    tracker.handleEvent(toolEnd("call_1", longTool, false, 103));

    // The unclamped trace line is wider than the requested width, so this
    // case genuinely exercises the clamp.
    const entry = tracker.entries().at(0);
    assert.ok(entry, "expected one trace entry");
    assert.ok(
      conservativeWidth(formatTraceLine(entry)) > WIDTH,
      "fixture trace line should exceed the width before clamping",
    );

    const lines = renderedLines(tracker.details(), "ok", WIDTH);
    assertEveryLineFits(lines, WIDTH);
  });

  it("clamps a double-width (CJK + emoji) argument", () => {
    const tracker = createTraceTracker({ role: ROLE });
    tracker.handleEvent(
      toolStart("call_1", "bash", {
        command: `${"漢字".repeat(30)}${"🚀".repeat(10)}`,
      }),
    );
    tracker.handleEvent(toolEnd("call_1", "bash", false, 103));

    const entry = tracker.entries().at(0);
    assert.ok(entry, "expected one trace entry");
    assert.ok(
      conservativeWidth(formatTraceLine(entry)) > WIDTH,
      "fixture trace line should exceed the width before clamping",
    );

    const lines = renderedLines(tracker.details(), "ok", WIDTH);
    assertEveryLineFits(lines, WIDTH);
  });

  it("renders legacy details that carry no trace array", () => {
    // A session resumed from details stored before the trace existed carries
    // { role } only — the renderer must not throw and must drop the trace.
    const legacy = { role: ROLE } as unknown as TaskDetails;
    const lines = renderedLines(legacy, "Report.", WIDTH);
    assert.deepEqual(lines, ["Report."]);
  });
});

describe("microspec_task: renderResult collapsed preview", () => {
  const WIDTH = 80;

  const role: RoleAsset = {
    id: ROLE,
    path: `agents/${ROLE}.md`,
    body: `# ${ROLE}\n\nDo the scoped work.`,
    description: "executes one plan step",
    mode: "subagent",
  };
  const tool = createTaskTool([role]);

  function renderedLines(
    details: TaskDetails,
    reportText: string,
    expanded: boolean,
  ): string[] {
    const result: AgentToolResult<TaskDetails> = {
      content: [{ type: "text", text: reportText }],
      details,
    };
    const component = tool.renderResult!(
      result,
      { expanded, isPartial: false },
      {} as never,
      {} as never,
    );
    return component.render(WIDTH);
  }

  const report30 = Array.from(
    { length: 30 },
    (_, index) => `report line ${index + 1}`,
  ).join("\n");

  it("caps the collapsed report at 10 visual lines with a skipped-count hint", () => {
    const lines = renderedLines(
      { role: ROLE, trace: [], writingChars: null },
      report30,
      false,
    );
    assert.equal(lines.length, 11);
    assert.equal(lines[0], "report line 1");
    assert.equal(lines[9], "report line 10");
    assert.equal(lines[10], "… (20 more lines, to expand)");
  });

  it("prints the whole report when expanded", () => {
    const lines = renderedLines(
      { role: ROLE, trace: [], writingChars: null },
      report30,
      true,
    );
    assert.equal(lines.length, 30);
    assert.equal(lines[0], "report line 1");
    assert.equal(lines[29], "report line 30");
  });

  it("keeps the trace block unconditional in both views (AC10)", () => {
    const tracker = createTraceTracker({ role: ROLE });
    tracker.handleEvent(toolStart("call_1", "read", { path: "f0.ts" }));
    tracker.handleEvent(toolEnd("call_1", "read", false, 100));
    const details = tracker.details();

    for (const expanded of [false, true]) {
      const lines = renderedLines(details, report30, expanded);
      assert.equal(lines[0], "read f0.ts 100ms ok");
      assert.equal(lines[1], "report line 1");
    }
  });
});

describe("createTraceTracker: reused toolCallId", () => {
  it("closes the newest matching entry, not the oldest", () => {
    const tracker = createTraceTracker({ role: ROLE });
    tracker.handleEvent(toolStart("dup", "read", { path: "old.ts" }));
    tracker.handleEvent(toolStart("dup", "read", { path: "new.ts" }));
    tracker.handleEvent(toolEnd("dup", "read", false, 42));

    const entries = tracker.entries();
    assert.equal(entries.length, 2);
    const oldest = entries.at(0);
    const newest = entries.at(1);
    assert.ok(oldest && newest, "expected two trace entries");
    assert.equal(oldest.status, "running");
    assert.equal(newest.status, "ok");
    assert.equal(newest.durationMs, 42);
  });
});
