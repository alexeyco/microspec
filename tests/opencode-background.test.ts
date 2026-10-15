// Tests for opencode/background.ts — the pure forceBackgroundEvent helper.
// No host APIs involved: the helper takes (tool, input, roleIds) and returns
// a new input or passes the same value through untouched.
//
// The `task` tool name and the `subagent_type` field are exercised here as
// legacy fallback inputs that older hosts may still emit; they are not the
// current v2 API names (`subagent` tool, `agent` field).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { forceBackgroundEvent } from "../opencode/background.ts";
import { ROLE_IDS } from "../core/roles.ts";

// A role id known to exist in core/roles.ts and one that never matches.
const ROLE = "microspec-implementer";
const NOT_ROLE = "some-other-agent";

// Narrow the unknown result of forceBackgroundEvent to a record for asserts.
function asRecord(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  assert.ok(!Array.isArray(value));
  return value as Record<string, unknown>;
}

// Assert the forced-result shape: a NEW object with background: true and
// the original fields preserved.
function assertForced(input: Record<string, unknown>, result: unknown): void {
  assert.notEqual(result, input, "forced result must be a new object");
  const record = asRecord(result);
  assert.equal(record.background, true);
  for (const [key, value] of Object.entries(input)) {
    if (key === "background") continue;
    assert.equal(record[key], value, `field ${key} must be preserved`);
  }
}

describe("forceBackgroundEvent — subagent tool", () => {
  it("forces background: true for every role id in ROLE_IDS", () => {
    for (const id of ROLE_IDS) {
      const input = { agent: id, prompt: "do the step" };
      assertForced(input, forceBackgroundEvent("subagent", input, ROLE_IDS));
    }
  });

  it("passes a non-role agent through untouched", () => {
    const input = { agent: NOT_ROLE, prompt: "explore" };
    const result = forceBackgroundEvent("subagent", input, ROLE_IDS);
    assert.equal(result, input, "non-role input must be returned by reference");
    assert.equal(asRecord(result).background, undefined);
  });
});

describe("forceBackgroundEvent — legacy task tool", () => {
  it("forces background: true for a role agent", () => {
    const input = { agent: ROLE };
    assertForced(input, forceBackgroundEvent("task", input, ROLE_IDS));
  });

  it("passes a non-role agent through untouched", () => {
    const input = { agent: NOT_ROLE };
    const result = forceBackgroundEvent("task", input, ROLE_IDS);
    assert.equal(result, input);
    assert.equal(asRecord(result).background, undefined);
  });

  it("matches the legacy subagent_type field when agent is absent", () => {
    const input = { subagent_type: ROLE, prompt: "legacy dispatch" };
    assertForced(input, forceBackgroundEvent("task", input, ROLE_IDS));
  });

  it("passes through a non-role legacy subagent_type", () => {
    const input = { subagent_type: NOT_ROLE };
    const result = forceBackgroundEvent("task", input, ROLE_IDS);
    assert.equal(result, input);
    assert.equal(asRecord(result).background, undefined);
  });
});

describe("forceBackgroundEvent — explicit background: false is overridden", () => {
  it("replaces background: false with true for a role agent", () => {
    const input = { agent: ROLE, background: false };
    const result = forceBackgroundEvent("subagent", input, ROLE_IDS);
    assertForced(input, result);
    assert.equal(
      input.background,
      false,
      "original input must still report its prior background: false",
    );
  });

  it("overrides background: false on the legacy task tool as well", () => {
    const input = { agent: ROLE, background: false };
    const result = forceBackgroundEvent("task", input, ROLE_IDS);
    assertForced(input, result);
    assert.equal(input.background, false);
  });
});

describe("forceBackgroundEvent — role field fallback", () => {
  it("matches the legacy subagent_type field when agent is absent", () => {
    const input = { subagent_type: ROLE, prompt: "legacy" };
    assertForced(input, forceBackgroundEvent("subagent", input, ROLE_IDS));
  });

  it("passes through a non-role legacy subagent_type", () => {
    const input = { subagent_type: NOT_ROLE };
    const result = forceBackgroundEvent("subagent", input, ROLE_IDS);
    assert.equal(result, input);
    assert.equal(asRecord(result).background, undefined);
  });

  it("prefers agent over subagent_type when both fields are present", () => {
    // agent matches, legacy field does not → forced on agent.
    const roleAgent = { agent: ROLE, subagent_type: NOT_ROLE };
    assertForced(
      roleAgent,
      forceBackgroundEvent("subagent", roleAgent, ROLE_IDS),
    );

    // agent does not match, legacy field does → agent takes precedence,
    // so no match and the input passes through untouched.
    const otherAgent = { agent: NOT_ROLE, subagent_type: ROLE };
    const result = forceBackgroundEvent("subagent", otherAgent, ROLE_IDS);
    assert.equal(result, otherAgent);
    assert.equal(asRecord(result).background, undefined);
  });

  it("passes through when neither role field is present", () => {
    const input = { description: "no role here" };
    const result = forceBackgroundEvent("subagent", input, ROLE_IDS);
    assert.equal(result, input);
    assert.equal(asRecord(result).background, undefined);
  });
});

describe("forceBackgroundEvent — non-matching tool", () => {
  it("leaves a role-looking input for another tool untouched", () => {
    const input = { agent: ROLE, background: false, path: "README.md" };
    const result = forceBackgroundEvent("read", input, ROLE_IDS);
    assert.equal(result, input, "other tools must be returned by reference");
    assert.equal(input.background, false, "read input must stay unchanged");
  });
});

describe("forceBackgroundEvent — non-object input", () => {
  it("passes undefined, null, primitives, and arrays through", () => {
    for (const value of [undefined, null, "subagent", 42, [{ agent: ROLE }]]) {
      assert.equal(forceBackgroundEvent("subagent", value, ROLE_IDS), value);
    }
  });
});

describe("forceBackgroundEvent — no mutation", () => {
  it("returns a new object and leaves the original without a background field", () => {
    const input = { agent: ROLE, prompt: "write the report" };
    const result = forceBackgroundEvent("subagent", input, ROLE_IDS);
    assert.notEqual(result, input);
    assert.ok(
      !("background" in input),
      "original object must not gain a background field",
    );
    assert.equal(asRecord(result).background, true);
    assert.equal(asRecord(result).prompt, "write the report");
  });
});
