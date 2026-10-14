// Pi adapter: microspec_validate_task tool — mechanical TASK.md contract validation.

import { Type, type Static } from "typebox";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  AgentToolResult,
  ExtensionToolContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import {
  TASK_FILENAME,
  reportTask,
  formatTaskReport,
} from "../core/contract.ts";

// Build the microspec_validate_task ToolDefinition.
// Input: optional path (default TASK.md resolved against ctx.cwd).
// Returns a text report: VALID status=<status> or INVALID <n> violation(s):.
export function createValidateTool(): ToolDefinition {
  const parameters = Type.Object({
    path: Type.Optional(Type.String()),
  });

  return {
    name: "microspec_validate_task",
    label: "Task Contract validator",
    description: [
      "Validate a TASK.md file against the Task Contract rules.",
      "Returns VALID status=<status> or INVALID <n> violation(s): with numbered issues.",
      `Default path is ${TASK_FILENAME} in the session working directory.`,
    ].join(" "),
    parameters,
    async execute(
      _toolCallId: string,
      params: Static<typeof parameters>,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: ExtensionToolContext,
    ): Promise<
      AgentToolResult<{ ok: boolean; violations: readonly string[] }>
    > {
      const filePath = resolve(ctx.cwd, params.path ?? TASK_FILENAME);
      let raw: string;
      try {
        raw = await readFile(filePath, "utf8");
      } catch {
        return {
          content: [
            {
              type: "text",
              text: "TASK.md not found — run /microspec.brief first",
            },
          ],
          details: { ok: false, violations: ["TASK.md not found"] },
          isError: true,
        };
      }

      const report = reportTask(raw);
      const text = formatTaskReport(report);

      return {
        content: [{ type: "text", text }],
        details: { ok: report.ok, violations: report.violations },
      };
    },
  };
}
