// Pure helper for the OpenCode v2 plugin: forces microspec-role subagents to
// dispatch in the background. Deliberately host-API free (no Plugin/ctx
// imports) so it stays unit-testable; the plugin entry wires it into the
// tool hook.

// Tool names whose dispatch this helper may redirect. `subagent` is the
// current v2 name; `task` is matched only to cover older hosts that still
// emit it at hook time.
const DISPATCH_TOOLS = new Set(["subagent", "task"]);

// Input fields that may carry the role name. `agent` is the current v2 field;
// `subagent_type` is the legacy fallback the host normalizer may still pass
// through to the hook.
const ROLE_FIELDS = ["agent", "subagent_type"] as const;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function roleNameFrom(input: Record<string, unknown>): string | undefined {
  for (const field of ROLE_FIELDS) {
    const value = input[field];
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

/**
 * Return a hook input with `background: true` when `tool` is a subagent
 * dispatch tool and its role name matches one of `roleIds`; explicit
 * `background: false` is overridden. Every other case passes the same value
 * through untouched — the argument is never mutated.
 */
export function forceBackgroundEvent(
  tool: string,
  input: unknown,
  roleIds: Iterable<string>,
): unknown {
  if (!DISPATCH_TOOLS.has(tool)) {
    return input;
  }

  const record = asRecord(input);
  if (record === undefined) {
    return input;
  }

  const role = roleNameFrom(record);
  if (role === undefined) {
    return input;
  }

  for (const id of roleIds) {
    if (id === role) {
      return { ...record, background: true };
    }
  }

  return input;
}
