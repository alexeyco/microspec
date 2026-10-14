// Load role definitions from agents/*.md into typed RoleAsset[].
// Each .md file's filename (minus .md) becomes the role id.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseMarkdown, validateRoleDoc, type RoleDoc } from "./markdown.ts";

export const ROLE_IDS = [
  "microspec-researcher",
  "microspec-drafter",
  "microspec-critic",
  "microspec-implementer",
  "microspec-verifier",
  "microspec-reviewer",
  "microspec-docwriter",
  "microspec-planner",
  "microspec-retrospector",
] as const;

export type RoleId = (typeof ROLE_IDS)[number];

export interface RoleAsset extends RoleDoc {
  readonly id: string;
  readonly path: string;
  readonly body: string;
}

export function loadRoles(agentsDir: string): RoleAsset[] {
  const entries = readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
  const roles: RoleAsset[] = [];
  for (const file of entries) {
    const id = file.replace(/\.md$/, "");
    const filePath = join(agentsDir, file);
    const raw = readFileSync(filePath, "utf-8");
    const { frontmatter, body } = parseMarkdown<unknown>(raw);
    const doc = validateRoleDoc(frontmatter);
    roles.push({ id, path: filePath, body, ...doc });
  }
  // Sort by id for deterministic ordering
  roles.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return roles;
}
