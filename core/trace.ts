// Pure trace model for the live child-agent trace: statuses, entries, and
// single-line formatting. Host-agnostic by design — core/ allows only Node
// builtins and `yaml`, and this module needs neither.

/** Status of a single traced tool call. */
export type TraceStatus = "running" | "ok" | "FAIL";

/** One traced child tool call, as rendered in the live trace. */
export interface TraceEntry {
  toolCallId: string;
  tool: string;
  arg: string;
  durationMs: number | null;
  status: TraceStatus;
}

/** Maximum length of a formatted argument before it is truncated. */
export const TRACE_ARG_MAX = 60;

const ELLIPSIS = "…";

function firstLine(text: string): string {
  const newline = text.indexOf("\n");
  return newline === -1 ? text : text.slice(0, newline);
}

function truncate(text: string): string {
  const chars = [...text];
  if (chars.length <= TRACE_ARG_MAX) {
    return text;
  }
  return chars.slice(0, TRACE_ARG_MAX).join("") + ELLIPSIS;
}

// Per-tool argument summary fields for the common Pi builtins. Field names
// verified against the installed Pi 1.2.0 builtin tool schemas
// (pi-coding-agent dist/core/tools/*.js): bash.command, write.path,
// grep.pattern, find.pattern, ls.path. Tools not
// listed here fall back to the shortest useful representation (see
// singleStringField). `read`/`edit` are handled by formatFileRange instead.
const TOOL_ARG_FIELDS: Readonly<Record<string, string>> = {
  bash: "command",
  write: "path",
  grep: "pattern",
  find: "pattern",
  ls: "path",
};

// Tool-aware rendering for file tools: `path:start-end` when a numeric
// offset/limit pair is present, bare `path` otherwise.
function formatFileRange(args: unknown): string | null {
  if (typeof args !== "object" || args === null) {
    return null;
  }
  const record = args as Record<string, unknown>;
  if (typeof record.path !== "string") {
    return null;
  }
  const offset = record.offset;
  const limit = record.limit;
  if (typeof offset !== "number" || typeof limit !== "number" || limit <= 0) {
    return record.path;
  }
  return `${record.path}:${offset}-${offset + limit - 1}`;
}

// Read a single string-valued field off an unknown args object.
function stringField(args: unknown, field: string): string | null {
  if (typeof args !== "object" || args === null) {
    return null;
  }
  const value = (args as Record<string, unknown>)[field];
  return typeof value === "string" ? value : null;
}

// Shortest useful representation for unmapped tools: when the args object has
// exactly one string-valued field, that value alone says more than a JSON
// dump of the whole object. Anything else (zero or several string fields)
// yields null so the caller can fall back to compact JSON.
function singleStringField(args: unknown): string | null {
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return null;
  }
  let found: string | null = null;
  for (const value of Object.values(args as Record<string, unknown>)) {
    if (typeof value === "string") {
      if (found !== null) {
        return null;
      }
      found = value;
    }
  }
  return found;
}

function stringifyArgs(args: unknown): string {
  if (typeof args === "string") {
    return args;
  }
  if (args === undefined) {
    return "";
  }
  try {
    return JSON.stringify(args) ?? String(args);
  } catch {
    return String(args);
  }
}

/**
 * Format a tool call's arguments as a single-line trace argument: first line
 * only, tool-aware for `read`/`edit` (`path:lines`) and for the common Pi
 * builtins (the tool's payload field, e.g. `bash` -> `command`), a single
 * string field for unmapped tools when that is the whole payload, compact
 * JSON otherwise — truncated to TRACE_ARG_MAX characters with a trailing
 * ellipsis.
 */
export function formatTraceArg(tool: string, args: unknown): string {
  if (tool === "read" || tool === "edit") {
    const range = formatFileRange(args);
    if (range !== null) {
      return truncate(firstLine(range));
    }
  }
  const field = TOOL_ARG_FIELDS[tool];
  if (field !== undefined) {
    const value = stringField(args, field);
    if (value !== null) {
      return truncate(firstLine(value));
    }
  }
  const single = singleStringField(args);
  if (single !== null) {
    return truncate(firstLine(single));
  }
  return truncate(firstLine(stringifyArgs(args)));
}

/**
 * Format a duration for the trace line: `340ms` below 1000 ms, `6.4s` at or
 * above, and the in-progress placeholder `…` while running (null).
 */
export function formatDuration(ms: number | null): string {
  if (ms === null) {
    return ELLIPSIS;
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Format one trace entry as `<tool> <arg> <duration> <status>`. */
export function formatTraceLine(entry: TraceEntry): string {
  const duration = formatDuration(entry.durationMs);
  return `${entry.tool} ${entry.arg} ${duration} ${entry.status}`;
}

/** Entry lines kept visible; older ones collapse into a `… N more` counter. */
export const TRACE_MAX_VISIBLE_LINES = 8;

/**
 * Group an integer's digits the en-US way (1214 -> "1,214") without relying on
 * the host locale or `toLocaleString`.
 */
function groupDigits(value: number): string {
  const text = String(value);
  const dot = text.indexOf(".");
  const intPart = dot === -1 ? text : text.slice(0, dot);
  const rest = dot === -1 ? "" : text.slice(dot);
  const sign = intPart.startsWith("-") ? "-" : "";
  const digits = sign === "" ? intPart : intPart.slice(1);
  return `${sign}${digits.replace(/\B(?=(\d{3})+$)/g, ",")}${rest}`;
}

/** Format the writing-progress tail line: `writing report… (1,214 chars)`. */
export function formatWritingTail(chars: number): string {
  return `writing report${ELLIPSIS} (${groupDigits(chars)} chars)`;
}

/**
 * Render the windowed trace as a single `\n`-separated string: an optional
 * `… N more` line for entries outside the window, then the last
 * TRACE_MAX_VISIBLE_LINES formatted lines, then the optional writing tail
 * (emitted only for a positive `writingChars`).
 */
export function renderTrace(
  entries: readonly TraceEntry[],
  writingChars?: number | null,
): string {
  const lines: string[] = [];
  const hidden = entries.length - TRACE_MAX_VISIBLE_LINES;
  if (hidden > 0) {
    lines.push(`${ELLIPSIS} ${hidden} more`);
  }
  for (const entry of entries.slice(-TRACE_MAX_VISIBLE_LINES)) {
    lines.push(formatTraceLine(entry));
  }
  if (typeof writingChars === "number" && writingChars > 0) {
    lines.push(formatWritingTail(writingChars));
  }
  return lines.join("\n");
}
