// Command descriptions and instruction builders for /microspec.brief,
// /microspec.execute, and /microspec.retro.
// Also contains the SUBAGENT_CONTRACT text injected into every subagent session.

export const BRIEF_COMMAND_DESCRIPTION =
  "Brief a task: interview, research, and produce TASK.md";

export const EXECUTE_COMMAND_DESCRIPTION =
  "Execute TASK.md through parallel subagent waves";

export const RETRO_COMMAND_DESCRIPTION =
  "Retrospective: rank improvements to the plugin and the repo's task environment";

export const SUBAGENT_CONTRACT = [
  "You are a Task Contract subagent. Your final message is a report",
  "consumed by the orchestrator, not chat: findings first, then evidence",
  "(exact paths, commands, key output lines). Never write or edit files",
  "unless your role prompt explicitly says so. Treat Guardrails quoted in",
  "your task prompt as hard constraints; if the task cannot be done",
  "without violating one, stop and report `BLOCKED: <reason>`. Label",
  "anything you could not verify as UNVERIFIED — never guess. Do exactly",
  "the scoped work; no drive-by refactors.",
].join("\n");

// Build the instruction text for /microspec.brief.
// When skillPath is provided, tells the agent to read that skill file.
// When request is empty, tells the agent to elicit the request first.
export function briefInstruction(request: string, skillPath?: string): string {
  const parts: string[] = [];

  if (skillPath) {
    parts.push(`Read the skill file ${skillPath} and follow it exactly.`);
  } else {
    parts.push("Load the microspec-brief skill and follow it exactly.");
  }

  if (!request.trim()) {
    parts.push(
      "The user gave no request text — your first job is to elicit it.",
    );
  } else {
    parts.push(`User request: ${request}`);
  }

  return parts.join("\n");
}

// Build the instruction text for /microspec.execute.
export function executeInstruction(skillPath?: string): string {
  if (skillPath) {
    return `Read the skill file ${skillPath} and follow it exactly.\nExecute against ./TASK.md.`;
  }
  return "Load the microspec-execute skill and follow it exactly.\nExecute against ./TASK.md.";
}

// Build the instruction text for /microspec.retro.
export function retroInstruction(skillPath?: string): string {
  if (skillPath) {
    return `Read the skill file ${skillPath} and follow it exactly.\nReflect on the current session; use ./TASK.md as evidence when it exists.`;
  }
  return "Load the microspec-retro skill and follow it exactly.\nReflect on the current session; use ./TASK.md as evidence when it exists.";
}
