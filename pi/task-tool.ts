// Pi adapter: microspec_task tool — runs a Task Contract subagent to completion
// via a nested createAgentSession and returns its final assistant text as a report.

import { Type, type Static } from "typebox";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type {
  AgentSessionEvent,
  AgentToolResult,
  ExtensionToolContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { SUBAGENT_CONTRACT } from "../core/prompts.ts";
import type { RoleAsset } from "../core/roles.ts";

// Build the system prompt for a subagent session: role body + contract.
// Exported for testing.
export function buildSubagentSystemPrompt(role: RoleAsset): string {
  return `${role.body.trim()}\n\n${SUBAGENT_CONTRACT}`;
}

// Build the microspec_task ToolDefinition from a set of loaded roles.
// The role enum and description are derived from the roles array so that
// adding/removing agents/*.md files automatically updates the tool.
export function createTaskTool(roles: readonly RoleAsset[]): ToolDefinition {
  // TypeBox schema: role is a union of literal role ids, prompt is a non-empty string.
  const roleLiterals = roles.map((r) => Type.Literal(r.id));
  const parameters = Type.Object({
    role: Type.Union(roleLiterals),
    prompt: Type.String({ minLength: 1 }),
  });

  // Description lists each role with its one-line description so the model
  // can pick the right one. Independent calls in one assistant message run
  // in parallel — the model should batch them.
  const roleLines = roles.map((r) => `- ${r.id}: ${r.description}`).join("\n");
  const description = [
    "Run a Task Contract subagent to completion and return its report.",
    "Roles:",
    roleLines,
    "Independent calls issued in one assistant message run in parallel — batch them.",
  ].join("\n");

  return {
    name: "microspec_task",
    label: "Task Contract subagent",
    description,
    parameters,
    async execute(
      _toolCallId: string,
      params: Static<typeof parameters>,
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: ExtensionToolContext,
    ): Promise<AgentToolResult<{ role: string }>> {
      // Resolve the requested role
      const role = roles.find((r) => r.id === params.role);
      if (!role) {
        return {
          content: [{ type: "text", text: `Unknown role: ${params.role}` }],
          details: { role: params.role },
          isError: true,
        };
      }

      // Early exit if already aborted before we start
      if (signal?.aborted) {
        return {
          content: [{ type: "text", text: "aborted" }],
          details: { role: role.id },
          isError: true,
        };
      }

      const systemPrompt = buildSubagentSystemPrompt(role);
      const agentDir = getAgentDir();
      const settingsManager = SettingsManager.create(ctx.cwd, agentDir, {
        projectTrusted: ctx.isProjectTrusted(),
      });

      // In-memory loader: no extensions, skills, prompt templates, themes, or
      // context files. The system prompt is fully overridden with the role body
      // + contract so the subagent has a clean, scoped context.
      const loader = new DefaultResourceLoader({
        settingsManager,
        cwd: ctx.cwd,
        agentDir,
        noExtensions: true,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
        systemPromptOverride: () => systemPrompt,
        appendSystemPromptOverride: () => [],
      });
      await loader.reload();

      const sessionManager = SessionManager.inMemory(ctx.cwd);

      // Pi >= 0.80.8 renamed createAgentSession's modelRegistry option to
      // modelRuntime, but ExtensionContext only exposes the registry facade.
      // Pass both so the full supported Pi range retains the parent's providers.
      const parentModelRuntime = (
        ctx.modelRegistry as unknown as { runtime?: unknown }
      ).runtime;

      // Build session options. Pi 1.1.0 uses `modelRuntime` (not `modelRegistry`)
      // in CreateAgentSessionOptions. The parent's runtime is extracted from the
      // registry facade (the only surface ExtensionContext exposes).
      const sessionOptions = {
        cwd: ctx.cwd,
        agentDir,
        sessionManager,
        settingsManager,
        ...(parentModelRuntime !== undefined && {
          // `as never` keeps this assignable: the opaque `unknown` read off
          // the private facade field can never satisfy the ModelRuntime type.
          modelRuntime: parentModelRuntime as never,
        }),
        ...(ctx.model && { model: ctx.model }),
        resourceLoader: loader,
      };

      const { session } = await createAgentSession(sessionOptions);

      // Propagate the parent tool's abort into the child session: an Esc on
      // the parent run must not leave the subagent streaming in the background.
      // Attach immediately after session creation so no abort is lost.
      const onAbort = () => {
        void session.abort();
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      // try/finally spans from right after createAgentSession so that
      // setSessionName / bindExtensions throwing cannot leak the session.
      try {
        // Re-check after listener attachment in case abort fired between
        // the early check above and now.
        if (signal?.aborted) {
          return {
            content: [{ type: "text", text: "aborted" }],
            details: { role: role.id },
            isError: true,
          };
        }

        session.setSessionName(`microspec:${role.id}`);
        await session.bindExtensions({});

        // Collect the last assistant message text via session events.
        // Reset on each new assistant message_start; accumulate text_delta updates.
        let text = "";
        const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
          if (
            event.type === "message_start" &&
            event.message.role === "assistant"
          ) {
            text = "";
          }
          if (
            event.type === "message_update" &&
            event.assistantMessageEvent.type === "text_delta"
          ) {
            text += event.assistantMessageEvent.delta;
          }
        });

        try {
          await session.prompt(params.prompt);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            content: [
              { type: "text", text: `microspec_task error: ${message}` },
            ],
            details: { role: role.id },
            isError: true,
          };
        } finally {
          unsubscribe();
        }

        // Fallback when the subagent produced no assistant text
        const finalText = text || "Subagent produced no final text.";

        return {
          content: [{ type: "text", text: finalText }],
          details: { role: role.id },
        };
      } finally {
        signal?.removeEventListener("abort", onAbort);
        // In-memory one-shot session: release it as soon as the report is in.
        session.dispose();
      }
    },
  };
}
