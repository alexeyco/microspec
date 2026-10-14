// Pi adapter: microspec_task tool — runs a Task Contract subagent to completion
// via a nested createAgentSession and returns its final assistant text as a report.

import { Type, type Static } from "typebox";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  SettingsManager,
  truncateToVisualLines,
} from "@earendil-works/pi-coding-agent";
import type {
  AgentSessionEvent,
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionToolContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { SUBAGENT_CONTRACT } from "../core/prompts.ts";
import type { RoleAsset } from "../core/roles.ts";
import { formatTraceArg, renderTrace } from "../core/trace.ts";
import type { TraceEntry, TraceStatus } from "../core/trace.ts";

// Build the system prompt for a subagent session: role body + contract.
// Exported for testing.
export function buildSubagentSystemPrompt(role: RoleAsset): string {
  return `${role.body.trim()}\n\n${SUBAGENT_CONTRACT}`;
}

/** Details payload of a `microspec_task` result, live and final. */
export interface TaskDetails {
  role: string;
  trace: readonly TraceEntry[];
  writingChars: number | null;
}

/** Options for `createTraceTracker`. */
export interface TraceTrackerOptions {
  /** Role id of the traced subagent; carried in every partial result. */
  role: string;
  /** Streaming callback for partial results; absent means "collect only". */
  onUpdate?: (partial: AgentToolResult<TaskDetails>) => void;
  /** Clock used to measure the writing-progress throttle. Defaults to Date.now. */
  now?: () => number;
  /** Minimum gap between writing-progress emissions. Defaults to 5000 ms. */
  throttleMs?: number;
}

/**
 * Live trace of one subagent session. Session-free by design: the caller feeds
 * every `AgentSessionEvent` it receives into `handleEvent`.
 */
export interface TraceTracker {
  handleEvent(event: AgentSessionEvent): void;
  text(): string;
  entries(): readonly TraceEntry[];
  details(): TaskDetails;
  render(): string;
  markAborted(): void;
}

// Default minimum gap between writing-progress emissions (ms).
const DEFAULT_TRACE_THROTTLE_MS = 5000;

// Report preview size for the collapsed result view, mirroring the host's
// FALLBACK_PREVIEW_LINES convention (tool-execution.js).
const RESULT_PREVIEW_LINES = 10;

// Rendered lines are clamped this far below the requested width: the host
// wraps this component in a Box that adds horizontal padding around the
// returned lines, so filling the width exactly can still overflow.
const RENDER_WIDTH_MARGIN = 2;

// Sentinel maxVisualLines meaning "keep every visual line".
const ALL_VISUAL_LINES = Number.MAX_SAFE_INTEGER;

// Text.render (inside truncateToVisualLines) pads every visual line with
// trailing spaces up to the render width. The padding carries no visual
// information — the host's Box re-pads with the background anyway — so drop
// it to keep the returned lines' content exact.
function stripTrailingPadding(lines: string[]): string[] {
  return lines.map((line) => line.replace(/ +$/, ""));
}

/**
 * Track a subagent session as a live trace: one entry per child tool call,
 * plus the length of the assistant text the child is currently writing.
 *
 * Emission policy — tool events emit to `onUpdate` immediately (one call per
 * event); text-delta progress emits at most once per `throttleMs` of `now()`
 * time, so a chatty child cannot flood the parent UI.
 */
export function createTraceTracker(opts: TraceTrackerOptions): TraceTracker {
  const now = opts.now ?? Date.now;
  const throttleMs = opts.throttleMs ?? DEFAULT_TRACE_THROTTLE_MS;
  const trace: TraceEntry[] = [];
  let text = "";
  let lastWritingEmitAt: number | null = null;

  // Accumulated assistant text length; null while no text has arrived.
  function writingChars(): number | null {
    return text.length === 0 ? null : text.length;
  }

  // Every partial carries a snapshot so recorded updates keep the state they
  // were emitted with instead of mutating along with the tracker.
  function snapshot(): TaskDetails {
    return {
      role: opts.role,
      trace: trace.map((entry) => ({ ...entry })),
      writingChars: writingChars(),
    };
  }

  function emit(): void {
    opts.onUpdate?.({ content: [], details: snapshot() });
  }

  function emitWriting(): void {
    const at = now();
    if (lastWritingEmitAt !== null && at - lastWritingEmitAt < throttleMs) {
      return;
    }
    lastWritingEmitAt = at;
    emit();
  }

  function closeEntry(
    entry: TraceEntry,
    status: TraceStatus,
    durationMs: number | null,
  ): void {
    entry.status = status;
    entry.durationMs = durationMs;
  }

  function findEntry(toolCallId: string): TraceEntry | undefined {
    // Scan backwards: if a toolCallId is ever reused, the newest match is the
    // live one — closing the oldest would leave the newer entry stuck at
    // `running` forever.
    for (let index = trace.length - 1; index >= 0; index -= 1) {
      const entry = trace[index];
      if (entry !== undefined && entry.toolCallId === toolCallId) {
        return entry;
      }
    }
    return undefined;
  }

  return {
    handleEvent(event: AgentSessionEvent): void {
      switch (event.type) {
        case "tool_execution_start": {
          trace.push({
            toolCallId: event.toolCallId,
            tool: event.toolName,
            arg: formatTraceArg(event.toolName, event.args),
            durationMs: null,
            status: "running",
          });
          emit();
          return;
        }
        case "tool_execution_end": {
          // Status comes only from the event's isError flag — never from
          // parsing the child's output text.
          const entry = findEntry(event.toolCallId);
          if (entry === undefined) {
            return;
          }
          closeEntry(
            entry,
            event.isError ? "FAIL" : "ok",
            typeof event.durationMs === "number" ? event.durationMs : null,
          );
          emit();
          return;
        }
        case "message_start": {
          // Only the last assistant message is the report.
          if (event.message.role === "assistant") {
            text = "";
          }
          return;
        }
        case "message_update": {
          if (event.assistantMessageEvent.type !== "text_delta") {
            return;
          }
          text += event.assistantMessageEvent.delta;
          emitWriting();
          return;
        }
        default:
          return;
      }
    },
    text(): string {
      return text;
    },
    entries(): readonly TraceEntry[] {
      return trace.map((entry) => ({ ...entry }));
    },
    details(): TaskDetails {
      return snapshot();
    },
    render(): string {
      return renderTrace(trace, writingChars());
    },
    markAborted(): void {
      // An aborted child leaves its in-flight calls unfinished: close them as
      // FAIL without inventing a duration.
      for (const entry of trace) {
        if (entry.status === "running") {
          closeEntry(entry, "FAIL", null);
        }
      }
    },
  };
}

// Build the microspec_task ToolDefinition from a set of loaded roles.
// The role enum and description are derived from the roles array so that
// adding/removing agents/*.md files automatically updates the tool.
export function createTaskTool(roles: readonly RoleAsset[]): ToolDefinition {
  // TypeBox schema: role is a union of literal role ids, prompt is a non-empty string.
  const roleLiterals = roles.map((r) => Type.Literal(r.id));
  const parameters = Type.Object({
    role: Type.Union(roleLiterals),
    prompt: Type.String({ minLength: 1 }),
  });

  // Description lists each role with its one-line description so the model
  // can pick the right one. Independent calls in one assistant message run
  // in parallel — the model should batch them.
  const roleLines = roles.map((r) => `- ${r.id}: ${r.description}`).join("\n");
  const description = [
    "Run a Task Contract subagent to completion and return its report.",
    "Roles:",
    roleLines,
    "Independent calls issued in one assistant message run in parallel — batch them.",
  ].join("\n");

  return {
    name: "microspec_task",
    label: "Task Contract subagent",
    description,
    parameters,
    async execute(
      _toolCallId: string,
      params: Static<typeof parameters>,
      signal: AbortSignal | undefined,
      onUpdate: AgentToolUpdateCallback<TaskDetails> | undefined,
      ctx: ExtensionToolContext,
    ): Promise<AgentToolResult<TaskDetails>> {
      // Resolve the requested role
      const role = roles.find((r) => r.id === params.role);
      if (!role) {
        return {
          content: [{ type: "text", text: `Unknown role: ${params.role}` }],
          details: { role: params.role, trace: [], writingChars: null },
          isError: true,
        };
      }

      // Early exit if already aborted before we start
      if (signal?.aborted) {
        return {
          content: [{ type: "text", text: "aborted" }],
          details: { role: role.id, trace: [], writingChars: null },
          isError: true,
        };
      }

      // Live trace of the child session: every session event feeds the
      // tracker, which streams partial results through `onUpdate`. The
      // tracker is session-free, so it is built up front — the abort
      // listener below needs it to close in-flight entries.
      const tracker = createTraceTracker({ role: role.id, onUpdate });

      const systemPrompt = buildSubagentSystemPrompt(role);
      const agentDir = getAgentDir();
      const settingsManager = SettingsManager.create(ctx.cwd, agentDir, {
        projectTrusted: ctx.isProjectTrusted(),
      });

      // In-memory loader: no extensions, skills, prompt templates, themes, or
      // context files. The system prompt is fully overridden with the role body
      // + contract so the subagent has a clean, scoped context.
      const loader = new DefaultResourceLoader({
        settingsManager,
        cwd: ctx.cwd,
        agentDir,
        noExtensions: true,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
        systemPromptOverride: () => systemPrompt,
        appendSystemPromptOverride: () => [],
      });
      await loader.reload();

      const sessionManager = SessionManager.inMemory(ctx.cwd);

      // Pi >= 0.80.8 renamed createAgentSession's modelRegistry option to
      // modelRuntime, but ExtensionContext only exposes the registry facade.
      // Pass both so the full supported Pi range retains the parent's providers.
      const parentModelRuntime = (
        ctx.modelRegistry as unknown as { runtime?: unknown }
      ).runtime;

      // Build session options. Pi 1.1.0 uses `modelRuntime` (not `modelRegistry`)
      // in CreateAgentSessionOptions. The parent's runtime is extracted from the
      // registry facade (the only surface ExtensionContext exposes).
      const sessionOptions = {
        cwd: ctx.cwd,
        agentDir,
        sessionManager,
        settingsManager,
        ...(parentModelRuntime !== undefined && {
          // `as never` keeps this assignable: the opaque `unknown` read off
          // the private facade field can never satisfy the ModelRuntime type.
          modelRuntime: parentModelRuntime as never,
        }),
        ...(ctx.model && { model: ctx.model }),
        resourceLoader: loader,
      };

      const { session } = await createAgentSession(sessionOptions);

      // Propagate the parent tool's abort into the child session: an Esc on
      // the parent run must not leave the subagent streaming in the background.
      // Attach immediately after session creation so no abort is lost.
      const onAbort = () => {
        // In-flight child tool calls never reach a `tool_execution_end`, so
        // close them as FAIL. No emit: the tool has not settled yet, but the
        // aborted return below hands this exact state to the parent moments
        // later, so a partial update here would only be a redundant frame
        // that the settle result immediately supersedes.
        tracker.markAborted();
        void session.abort();
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      // try/finally spans from right after createAgentSession so that
      // setSessionName / bindExtensions throwing cannot leak the session.
      try {
        // Re-check after listener attachment in case abort fired between
        // the early check above and now.
        if (signal?.aborted) {
          return {
            content: [{ type: "text", text: "aborted" }],
            details: tracker.details(),
            isError: true,
          };
        }

        session.setSessionName(`microspec:${role.id}`);
        await session.bindExtensions({});

        // Collect the last assistant message text and the tool trace via
        // session events.
        const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
          tracker.handleEvent(event);
        });

        try {
          await session.prompt(params.prompt);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            content: [
              { type: "text", text: `microspec_task error: ${message}` },
            ],
            details: tracker.details(),
            isError: true,
          };
        } finally {
          unsubscribe();
        }

        // Fallback when the subagent produced no assistant text
        const finalText = tracker.text() || "Subagent produced no final text.";

        return {
          content: [{ type: "text", text: finalText }],
          details: tracker.details(),
        };
      } finally {
        signal?.removeEventListener("abort", onAbort);
        // In-memory one-shot session: release it as soon as the report is in.
        session.dispose();
      }
    },

    // Draw the completed trace above the report text. The windowed trace
    // (last 8 lines + `… N more` counter) stays visible after completion —
    // "no collapse" means the block is still drawn, not that all N lines print.
    // The report block honours `options.expanded`: collapsed shows a preview
    // plus a skipped-count hint. Every returned line is clamped to the
    // requested width. Returns a structural Component object literal so no
    // pi-tui import is needed.
    renderResult(result, options, _theme, _context) {
      const details = result.details as TaskDetails | undefined;
      // Details recorded before the trace existed carry { role } only —
      // guard so a resumed session renders instead of throwing here.
      const trace = Array.isArray(details?.trace) ? details.trace : [];
      // The `writing report… (N chars)` tail is a live-progress indicator:
      // draw it only while the call is still running (partial renders).
      // Once the result is final the report itself is on screen, so the
      // tail would be stale. `details.writingChars` stays populated — only
      // the drawing is conditional, on the host's own partial flag
      // (ToolRenderResultOptions.isPartial).
      const traceBlock = details
        ? renderTrace(trace, options.isPartial ? details.writingChars : null)
        : "";

      // Extract the report text from the first text content block.
      const textContent = result.content.find((c) => c.type === "text");
      const reportText = textContent?.type === "text" ? textContent.text : "";

      // Width-keyed cache: render() runs on every frame for every result in
      // the transcript (same convention as the host's VisualLinePreview).
      let cachedWidth: number | undefined;
      let cachedLines: string[] | undefined;

      return {
        render(width: number): string[] {
          if (cachedLines !== undefined && cachedWidth === width) {
            return cachedLines;
          }
          // Pi's TUI hard-fails on any line wider than the render width, so
          // every returned line is wrapped/clamped through the host's own
          // truncateToVisualLines (which measures via Text.render), leaving
          // margin for the host's wrapping Box padding.
          const budget = Math.max(1, width - RENDER_WIDTH_MARGIN);
          const lines: string[] = [];
          // AC10: the windowed trace stays visible after completion,
          // collapsed or expanded.
          if (traceBlock) {
            const block = truncateToVisualLines(
              traceBlock,
              ALL_VISUAL_LINES,
              budget,
              0,
              "start",
            );
            lines.push(...stripTrailingPadding(block.visualLines));
          }
          if (reportText) {
            const maxLines = options.expanded
              ? ALL_VISUAL_LINES
              : RESULT_PREVIEW_LINES;
            const preview = truncateToVisualLines(
              reportText,
              maxLines,
              budget,
              0,
              "start",
            );
            lines.push(...stripTrailingPadding(preview.visualLines));
            if (preview.skippedCount > 0) {
              // Collapsed hint, mirroring the host's "(N more lines, to
              // expand)" convention.
              const hint = `… (${preview.skippedCount} more lines, to expand)`;
              lines.push(
                ...stripTrailingPadding(
                  truncateToVisualLines(hint, 1, budget, 0, "start")
                    .visualLines,
                ),
              );
            }
          }
          cachedWidth = width;
          cachedLines = lines;
          return lines;
        },
        invalidate(): void {
          cachedWidth = undefined;
          cachedLines = undefined;
        },
      };
    },
  };
}
