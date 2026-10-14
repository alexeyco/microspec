// Frontmatter parse/validate for role and skill markdown assets.
// Uses the `yaml` package because flow-mapping arrays like
// `{ action: read, resource: "*", effect: allow }` need a real parser.

import YAML from "yaml";

export interface RoleDoc {
  readonly description: string;
  readonly mode: string;
  readonly color?: string;
}

export interface SkillDoc {
  readonly name: string;
  readonly description: string;
}

export interface ParsedMarkdown<T> {
  readonly frontmatter: T;
  readonly body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseMarkdown<T = unknown>(raw: string): ParsedMarkdown<T> {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    throw new Error("markdown: missing or invalid YAML frontmatter");
  }
  const yamlText = match[1]!;
  const body = raw.slice(match[0].length);
  let frontmatter: unknown;
  try {
    frontmatter = YAML.parse(yamlText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`markdown: failed to parse frontmatter YAML: ${msg}`);
  }
  if (frontmatter === null || typeof frontmatter !== "object") {
    throw new Error("markdown: frontmatter must parse to an object");
  }
  return { frontmatter: frontmatter as T, body };
}

export function validateRoleDoc(value: unknown): RoleDoc {
  if (!value || typeof value !== "object") {
    throw new Error("role doc: frontmatter must be an object");
  }
  const v = value as Record<string, unknown>;

  // Reject legacy keys that were removed — stale assets must fail loudly.
  if ("tools" in v) {
    throw new Error(
      "role doc: 'tools' removed — behavior is bounded by the role prompt, SUBAGENT_CONTRACT and task Guardrails",
    );
  }
  if ("permissions" in v) {
    throw new Error(
      "role doc: 'permissions' removed — behavior is bounded by the role prompt, SUBAGENT_CONTRACT and task Guardrails",
    );
  }

  // description — required string
  if (typeof v.description !== "string") {
    throw new Error("role doc: frontmatter missing string 'description'");
  }

  // mode — required, must be "subagent"
  if (typeof v.mode !== "string" || v.mode !== "subagent") {
    throw new Error("role doc: frontmatter 'mode' must be \"subagent\"");
  }

  // color — optional string
  if (v.color !== undefined && typeof v.color !== "string") {
    throw new Error("role doc: frontmatter 'color' must be a string when set");
  }

  const doc: RoleDoc = {
    description: v.description,
    mode: v.mode,
  };
  if (typeof v.color === "string") {
    return { ...doc, color: v.color };
  }
  return doc;
}

export function validateSkillDoc(value: unknown): SkillDoc {
  if (!value || typeof value !== "object") {
    throw new Error("skill doc: frontmatter must be an object");
  }
  const v = value as Record<string, unknown>;
  if (typeof v.name !== "string") {
    throw new Error("skill doc: frontmatter missing string 'name'");
  }
  if (typeof v.description !== "string") {
    throw new Error("skill doc: frontmatter missing string 'description'");
  }
  return { name: v.name, description: v.description };
}
