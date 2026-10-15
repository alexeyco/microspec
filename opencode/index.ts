// OpenCode v2 plugin entry: registers 9 subagent roles from bundled markdown,
// 4 skills (microspec-brief, microspec-execute, microspec-retro, task-contract),
// three commands (/microspec.brief, /microspec.execute, /microspec.retro),
// and a validation tool (microspec_validate_task).
// Injects SUBAGENT_CONTRACT into every role's session context.

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { Agent, Plugin, Skill } from "@opencode/plugin";
import { parseMarkdown, validateSkillDoc } from "../core/markdown.ts";
import { loadRoles, ROLE_IDS } from "../core/roles.ts";
import {
  BRIEF_COMMAND_DESCRIPTION,
  EXECUTE_COMMAND_DESCRIPTION,
  RETRO_COMMAND_DESCRIPTION,
  SUBAGENT_CONTRACT,
  briefInstruction,
  executeInstruction,
  retroInstruction,
} from "../core/prompts.ts";
import { ensureTaskIgnored } from "../core/gitignore.ts";
import { forceBackgroundEvent } from "./background.ts";
import {
  TASK_FILENAME,
  reportTask,
  formatTaskReport,
} from "../core/contract.ts";

const agentsDir = path.join(import.meta.dirname, "..", "agents");
const skillsRoot = path.join(import.meta.dirname, "..", "skills");
const SKILL_IDS = [
  "microspec-brief",
  "microspec-execute",
  "microspec-retro",
  "task-contract",
] as const;

function readText(file: string): string {
  return readFileSync(file, "utf8");
}

export default Plugin.define({
  id: "microspec",
  async setup(ctx) {
    // cwd for git-ignore operations: prefer the plugin location, fall back to process cwd.
    const cwd = ctx.location?.directory ?? process.cwd();

    // ── Agents ──────────────────────────────────────────────────────────
    // Load the 9 role definitions from agents/*.md and register each as a
    // subagent with composed permissions (defaults → md rules → user tail).
    const roles = loadRoles(agentsDir);

    await ctx.agent.transform((editor) => {
      for (const role of roles) {
        editor.update(role.id, (agent) => {
          agent.name = Agent.Name.make(role.id);
          agent.description = role.description;
          agent.mode = role.mode as typeof agent.mode;
          if (role.color !== undefined) {
            agent.color = role.color;
          }
          agent.system = role.body.trim();
        });
      }
    });

    // ── Skills ──────────────────────────────────────────────────────────
    // Register the 4 skills from skills/<id>/SKILL.md via parseMarkdown +
    // validateSkillDoc, then reload so the host picks them up.
    await ctx.skill.transform((editor) => {
      for (const id of SKILL_IDS) {
        const skillPath = path.join(skillsRoot, id, "SKILL.md");
        const skillRaw = readText(skillPath);
        const { frontmatter: skillFm, body: skillBody } =
          parseMarkdown<unknown>(skillRaw);
        const skillDoc = validateSkillDoc(skillFm);
        editor.add(
          Skill.Info.make({
            id: Skill.ID.make(id),
            name: Skill.Name.make(skillDoc.name),
            description: skillDoc.description,
            path: skillPath as Skill.Info["path"],
            content: skillBody,
          }),
        );
      }
    });

    await ctx.skill.reload();

    // ── Contract body injection ────────────────────────────────────────
    // Push SUBAGENT_CONTRACT into the system prompt of every role subagent
    // so they share the same behavioral contract without per-file copies.
    const roleIds = new Set<string>(ROLE_IDS);
    ctx.session.hook("context", (event) => {
      if (roleIds.has(String(event.agent))) {
        event.system.push({
          type: "text",
          text: SUBAGENT_CONTRACT,
        });
      }
    });

    // Force background dispatch for subagent calls that target a microspec
    // role, so the orchestrator can run roles concurrently. The helper also
    // matches legacy tool names defensively on older hosts.
    ctx.tool.hook("execute.before", (event) => {
      event.input = forceBackgroundEvent(event.tool, event.input, roleIds);
    });

    // ── Commands ────────────────────────────────────────────────────────
    // /microspec.brief — ensure TASK.md is git-ignored, then prompt with the brief
    // instruction and attach the microspec-brief skill.
    // /microspec.execute — same defensive git-ignore check, then prompt with the
    // execute instruction and attach the microspec-execute skill.
    // /microspec.retro — prompt with the retro instruction and attach the
    // microspec-retro skill. Never creates TASK.md.
    await ctx.command.transform((editor) => {
      editor.add({
        name: "microspec.brief",
        description: BRIEF_COMMAND_DESCRIPTION,
        execute: async ({ sessionID, prompt }) => {
          await ensureTaskIgnored(cwd);
          await ctx.session.prompt({
            sessionID: sessionID as never,
            text: briefInstruction(prompt?.text ?? ""),
            skills: [{ id: Skill.ID.make("microspec-brief") }],
          } as never);
        },
      });
      editor.add({
        name: "microspec.execute",
        description: EXECUTE_COMMAND_DESCRIPTION,
        execute: async ({ sessionID }) => {
          // Idempotent defensive check — ensureTaskIgnored is safe to call
          // even if TASK.md is already ignored.
          await ensureTaskIgnored(cwd);
          await ctx.session.prompt({
            sessionID: sessionID as never,
            text: executeInstruction(),
            skills: [{ id: Skill.ID.make("microspec-execute") }],
          } as never);
        },
      });
      editor.add({
        name: "microspec.retro",
        description: RETRO_COMMAND_DESCRIPTION,
        execute: async ({ sessionID }) => {
          await ctx.session.prompt({
            sessionID: sessionID as never,
            text: retroInstruction(),
            skills: [{ id: Skill.ID.make("microspec-retro") }],
          } as never);
        },
      });
    });

    await ctx.command.reload();

    // ── Task validation tool ─────────────────────────────────────────────
    // microspec_validate_task — mechanical TASK.md contract validation so the
    // "contract is mechanical, not prompt-hoped" claim is enforceable.
    await ctx.tool.transform((editor) => {
      editor.add({
        name: "microspec_validate_task",
        description: [
          "Validate a TASK.md file against the Task Contract rules.",
          "Returns VALID status=<status> or INVALID <n> violation(s): with numbered issues.",
          "Default path is TASK.md in the session working directory.",
        ].join(" "),
        input: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: `Path to the task file (default: "${TASK_FILENAME}")`,
            },
          },
        } as never,
        execute: async (input: { path?: string }) => {
          const filePath = path.resolve(cwd, input.path ?? TASK_FILENAME);
          let raw: string;
          try {
            raw = await readFile(filePath, "utf8");
          } catch {
            return {
              content: "TASK.md not found — run /microspec.brief first",
            } as never;
          }
          const report = reportTask(raw);
          return { content: formatTaskReport(report) } as never;
        },
      } as never);
    });

    await ctx.tool.reload();
  },
});
