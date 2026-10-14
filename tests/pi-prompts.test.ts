// Tests for pi/task-tool.ts — createTaskTool and buildSubagentSystemPrompt.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { loadRoles, ROLE_IDS } from "../core/roles.ts";
import { createTaskTool, buildSubagentSystemPrompt } from "../pi/task-tool.ts";
import { SUBAGENT_CONTRACT } from "../core/prompts.ts";

// Load real roles from the agents/ directory (same as pi/index.ts does).
const agentsDir = join(import.meta.dirname, "..", "agents");
const roles = loadRoles(agentsDir);

describe("createTaskTool", () => {
  const tool = createTaskTool(roles);

  it("has name microspec_task", () => {
    assert.equal(tool.name, "microspec_task");
  });

  it("has a non-empty label", () => {
    assert.ok(tool.label.length > 0);
  });

  it("description mentions every role id", () => {
    for (const id of ROLE_IDS) {
      assert.ok(
        tool.description.includes(id),
        `description should mention ${id}`,
      );
    }
  });

  it("description mentions parallel batching", () => {
    assert.ok(tool.description.includes("parallel"));
  });

  it("parameters schema is an object with role and prompt properties", () => {
    // Cast to access TypeBox internals for structural testing
    const schema = tool.parameters as unknown as {
      type: string;
      properties: Record<string, unknown>;
    };
    assert.equal(schema.type, "object");
    assert.ok(
      "role" in schema.properties,
      "parameters should have 'role' property",
    );
    assert.ok(
      "prompt" in schema.properties,
      "parameters should have 'prompt' property",
    );
  });

  it("has an execute function", () => {
    assert.equal(typeof tool.execute, "function");
  });
});

describe("buildSubagentSystemPrompt", () => {
  it("ends with SUBAGENT_CONTRACT", () => {
    const role = roles.find((r) => r.id === "microspec-implementer");
    assert.ok(role, "microspec-implementer role should exist");
    const prompt = buildSubagentSystemPrompt(role);
    assert.ok(
      prompt.endsWith(SUBAGENT_CONTRACT),
      "system prompt should end with SUBAGENT_CONTRACT",
    );
  });

  it("starts with the role body (trimmed)", () => {
    const role = roles.find((r) => r.id === "microspec-researcher");
    assert.ok(role, "microspec-researcher role should exist");
    const prompt = buildSubagentSystemPrompt(role);
    assert.ok(
      prompt.startsWith(role.body.trim()),
      "system prompt should start with the role body",
    );
  });

  it("contains a separator between body and contract", () => {
    const role = roles.find((r) => r.id === "microspec-critic");
    assert.ok(role, "microspec-critic role should exist");
    const prompt = buildSubagentSystemPrompt(role);
    // The separator is "\n\n" between body and contract
    const bodyEnd = role.body.trim().length;
    const separator = prompt.slice(bodyEnd, bodyEnd + 2);
    assert.equal(separator, "\n\n");
  });

  it("works for every loaded role", () => {
    for (const role of roles) {
      const prompt = buildSubagentSystemPrompt(role);
      assert.ok(prompt.includes(role.body.trim().slice(0, 20)));
      assert.ok(prompt.endsWith(SUBAGENT_CONTRACT));
    }
  });
});
