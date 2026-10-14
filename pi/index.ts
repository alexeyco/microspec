// Pi extension entry point: registers the microspec_task tool and
// /microspec.brief, /microspec.execute, /microspec.retro commands.
// Roles are loaded once at factory time from the agents/ directory.

import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  BRIEF_COMMAND_DESCRIPTION,
  EXECUTE_COMMAND_DESCRIPTION,
  RETRO_COMMAND_DESCRIPTION,
  briefInstruction,
  executeInstruction,
  retroInstruction,
} from "../core/prompts.ts";
import { ensureTaskIgnored } from "../core/gitignore.ts";
import { loadRoles } from "../core/roles.ts";
import { createTaskTool } from "./task-tool.ts";
import { createValidateTool } from "./validate-tool.ts";

// Resolve the path to a skill's SKILL.md by its directory name.
function skillPath(id: string): string {
  return join(import.meta.dirname, "..", "skills", id, "SKILL.md");
}

export default function (pi: ExtensionAPI) {
  // Load role definitions once at extension factory time.
  const agentsDir = join(import.meta.dirname, "..", "agents");
  const roles = loadRoles(agentsDir);

  // Register the microspec_task subagent runner tool.
  pi.registerTool(createTaskTool(roles));

  // Register the microspec_validate_task contract validation tool.
  pi.registerTool(createValidateTool());

  // /microspec.brief — interview, research, produce TASK.md
  pi.registerCommand("microspec.brief", {
    description: BRIEF_COMMAND_DESCRIPTION,
    handler: async (args, ctx) => {
      const res = await ensureTaskIgnored(ctx.cwd);
      if (res.changed) {
        ctx.ui.notify("TASK.md added to .gitignore", "info");
      }
      await pi.sendUserMessage(
        briefInstruction(args, skillPath("microspec-brief")),
      );
    },
  });

  // /microspec.execute — run TASK.md through parallel subagent waves
  pi.registerCommand("microspec.execute", {
    description: EXECUTE_COMMAND_DESCRIPTION,
    handler: async (_args, ctx) => {
      // Defensive: ensureTaskIgnored is idempotent.
      await ensureTaskIgnored(ctx.cwd);
      await pi.sendUserMessage(
        executeInstruction(skillPath("microspec-execute")),
      );
    },
  });

  // /microspec.retro — retrospective on the current session
  pi.registerCommand("microspec.retro", {
    description: RETRO_COMMAND_DESCRIPTION,
    handler: async () => {
      await pi.sendUserMessage(retroInstruction(skillPath("microspec-retro")));
    },
  });
}
