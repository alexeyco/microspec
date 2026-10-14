// Tests for core/markdown.ts — parseMarkdown, validateRoleDoc, validateSkillDoc.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseMarkdown,
  validateRoleDoc,
  validateSkillDoc,
} from "../core/markdown.ts";

describe("parseMarkdown", () => {
  it("parses valid frontmatter and body", () => {
    const raw = ["---", "description: hello", "---", "", "# Body"].join("\n");
    const result = parseMarkdown<{ description: string }>(raw);
    assert.equal(result.frontmatter.description, "hello");
    assert.ok(result.body.includes("# Body"));
  });

  it("throws on missing frontmatter", () => {
    assert.throws(
      () => parseMarkdown("no frontmatter here"),
      (err: Error) => err.message.startsWith("markdown: "),
    );
  });

  it("throws on invalid YAML", () => {
    // Use a frontmatter payload that the yaml parser cannot handle.
    const raw = "---\n{ invalid: [\n---\n";
    assert.throws(
      () => parseMarkdown(raw),
      (err: Error) => err.message.startsWith("markdown: "),
    );
  });

  it("throws when frontmatter parses to non-object", () => {
    const raw = "---\njust a string\n---\n";
    assert.throws(
      () => parseMarkdown(raw),
      (err: Error) =>
        err.message.includes("frontmatter must parse to an object"),
    );
  });
});

describe("validateRoleDoc", () => {
  const validFm = {
    description: "A test role",
    mode: "subagent",
  };

  it("accepts a valid role doc", () => {
    const doc = validateRoleDoc(validFm);
    assert.equal(doc.description, "A test role");
    assert.equal(doc.mode, "subagent");
  });

  it("accepts optional color", () => {
    const doc = validateRoleDoc({ ...validFm, color: "#ff0000" });
    assert.equal(doc.color, "#ff0000");
  });

  it("throws when description missing", () => {
    assert.throws(
      () =>
        validateRoleDoc({
          mode: "subagent",
        }),
      (err: Error) => err.message.startsWith("role doc: "),
    );
  });

  it("throws when mode missing", () => {
    assert.throws(
      () =>
        validateRoleDoc({
          description: "test",
        }),
      (err: Error) => err.message.includes("mode"),
    );
  });

  it("throws when mode is not subagent", () => {
    assert.throws(
      () =>
        validateRoleDoc({
          description: "test",
          mode: "primary",
        }),
      (err: Error) => err.message.includes("subagent"),
    );
  });

  it("throws when legacy tools key is present", () => {
    assert.throws(
      () =>
        validateRoleDoc({
          description: "test",
          mode: "subagent",
          tools: ["read"],
        }),
      (err: Error) => err.message.includes("tools"),
    );
  });

  it("throws when legacy permissions key is present", () => {
    assert.throws(
      () =>
        validateRoleDoc({
          description: "test",
          mode: "subagent",
          permissions: [],
        }),
      (err: Error) => err.message.includes("permissions"),
    );
  });

  it("throws on non-object input", () => {
    assert.throws(
      () => validateRoleDoc("string"),
      (err: Error) => err.message.startsWith("role doc: "),
    );
  });
});

describe("validateSkillDoc", () => {
  it("accepts a valid skill doc", () => {
    const doc = validateSkillDoc({
      name: "microspec-brief",
      description: "Brief a task",
    });
    assert.equal(doc.name, "microspec-brief");
    assert.equal(doc.description, "Brief a task");
  });

  it("throws when name missing", () => {
    assert.throws(
      () => validateSkillDoc({ description: "test" }),
      (err: Error) => err.message.startsWith("skill doc: "),
    );
  });

  it("throws when description missing", () => {
    assert.throws(
      () => validateSkillDoc({ name: "test" }),
      (err: Error) => err.message.startsWith("skill doc: "),
    );
  });

  it("throws on non-object input", () => {
    assert.throws(
      () => validateSkillDoc(null),
      (err: Error) => err.message.startsWith("skill doc: "),
    );
  });
});
