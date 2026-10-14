// Tests for core/prompts.ts — constants and instruction builders.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BRIEF_COMMAND_DESCRIPTION,
  EXECUTE_COMMAND_DESCRIPTION,
  RETRO_COMMAND_DESCRIPTION,
  SUBAGENT_CONTRACT,
  briefInstruction,
  executeInstruction,
  retroInstruction,
} from "../core/prompts.ts";

describe("constants", () => {
  it("BRIEF_COMMAND_DESCRIPTION is a non-empty string", () => {
    assert.ok(BRIEF_COMMAND_DESCRIPTION.length > 0);
    assert.ok(BRIEF_COMMAND_DESCRIPTION.includes("TASK.md"));
  });

  it("EXECUTE_COMMAND_DESCRIPTION is a non-empty string", () => {
    assert.ok(EXECUTE_COMMAND_DESCRIPTION.length > 0);
    assert.ok(EXECUTE_COMMAND_DESCRIPTION.includes("subagent"));
  });

  it("RETRO_COMMAND_DESCRIPTION is a non-empty string", () => {
    assert.ok(RETRO_COMMAND_DESCRIPTION.length > 0);
  });

  it("SUBAGENT_CONTRACT contains key phrases", () => {
    assert.ok(SUBAGENT_CONTRACT.includes("Task Contract subagent"));
    assert.ok(SUBAGENT_CONTRACT.includes("BLOCKED"));
    assert.ok(SUBAGENT_CONTRACT.includes("UNVERIFIED"));
    assert.ok(SUBAGENT_CONTRACT.includes("Guardrails"));
  });
});

describe("briefInstruction", () => {
  it("uses skill path when provided", () => {
    const result = briefInstruction("add feature X", "/path/to/skill.md");
    assert.ok(result.includes("/path/to/skill.md"));
    assert.ok(result.includes("add feature X"));
  });

  it("uses default skill reference when no path", () => {
    const result = briefInstruction("add feature X");
    assert.ok(result.includes("microspec-brief skill"));
    assert.ok(result.includes("add feature X"));
  });

  it("elicits when request is empty", () => {
    const result = briefInstruction("");
    assert.ok(result.includes("elicit"));
  });

  it("elicits when request is whitespace only", () => {
    const result = briefInstruction("   ");
    assert.ok(result.includes("elicit"));
  });

  it("elicits when request is empty with skill path", () => {
    const result = briefInstruction("", "/path/skill.md");
    assert.ok(result.includes("elicit"));
    assert.ok(result.includes("/path/skill.md"));
  });
});

describe("executeInstruction", () => {
  it("uses skill path when provided", () => {
    const result = executeInstruction("/path/to/exec.md");
    assert.ok(result.includes("/path/to/exec.md"));
    assert.ok(result.includes("TASK.md"));
  });

  it("uses default skill reference when no path", () => {
    const result = executeInstruction();
    assert.ok(result.includes("microspec-execute skill"));
    assert.ok(result.includes("TASK.md"));
  });
});

describe("retroInstruction", () => {
  it("uses skill path when provided", () => {
    const result = retroInstruction("/path/to/retro.md");
    assert.ok(result.includes("/path/to/retro.md"));
    assert.ok(result.includes("TASK.md"));
  });

  it("uses default skill reference when no path", () => {
    const result = retroInstruction();
    assert.ok(result.includes("microspec-retro skill"));
    assert.ok(result.includes("TASK.md"));
  });

  it("both branches mention TASK.md as evidence", () => {
    const withPath = retroInstruction("/some/path.md");
    const withoutPath = retroInstruction();
    assert.ok(withPath.includes("./TASK.md"));
    assert.ok(withoutPath.includes("./TASK.md"));
  });
});
