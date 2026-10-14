// Tests for pi/index.ts — factory registration and command handler wiring.
// Uses a mock ExtensionAPI; no real pi runtime or model calls.

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import factory from "../pi/index.ts";

// ---------- mock helpers ----------

interface CapturedCommand {
  name: string;
  description: string;
  handler: (args: string, ctx: never) => Promise<void>;
}

function createMockPi() {
  const tools: { name: string }[] = [];
  const commands = new Map<string, CapturedCommand>();
  const sentMessages: string[] = [];

  const pi = {
    registerTool(tool: { name: string }) {
      tools.push(tool);
    },
    registerCommand(
      name: string,
      options: {
        description: string;
        handler: (args: string, ctx: never) => Promise<void>;
      },
    ) {
      commands.set(name, {
        name,
        description: options.description,
        handler: options.handler,
      });
    },
    async sendUserMessage(text: string) {
      sentMessages.push(text);
    },
  };

  return { pi, tools, commands, sentMessages };
}

// ---------- shared state ----------

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "microspec-ext-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------- tests ----------

describe("factory registration", () => {
  it("registers two tools: microspec_task and microspec_validate_task", () => {
    const { pi, tools } = createMockPi();
    factory(pi as never);
    assert.equal(tools.length, 2);
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["microspec_task", "microspec_validate_task"]);
  });

  it("registers microspec.brief, microspec.execute, and microspec.retro commands", () => {
    const { pi, commands } = createMockPi();
    factory(pi as never);

    const brief = commands.get("microspec.brief");
    assert.ok(brief, "microspec.brief command should be registered");
    assert.ok(
      brief.description.length > 0,
      "microspec.brief should have a non-empty description",
    );
    assert.equal(typeof brief.handler, "function");

    const execute = commands.get("microspec.execute");
    assert.ok(execute, "microspec.execute command should be registered");
    assert.ok(
      execute.description.length > 0,
      "microspec.execute should have a non-empty description",
    );
    assert.equal(typeof execute.handler, "function");

    const retro = commands.get("microspec.retro");
    assert.ok(retro, "microspec.retro command should be registered");
    assert.ok(
      retro.description.length > 0,
      "microspec.retro should have a non-empty description",
    );
    assert.equal(typeof retro.handler, "function");
  });
});

describe("microspec.brief handler", () => {
  function setupRepo() {
    mkdirSync(join(tempDir, ".git"));
  }

  it("creates .gitignore with TASK.md entry and notifies", async () => {
    setupRepo();

    const { pi, commands, sentMessages } = createMockPi();
    factory(pi as never);

    const notifyCalls: string[] = [];
    const ctx = {
      cwd: tempDir,
      ui: {
        notify: (msg: string) => {
          notifyCalls.push(msg);
        },
      },
      isProjectTrusted: () => true,
    } as never;

    const brief = commands.get("microspec.brief")!;
    await brief.handler("add a health endpoint", ctx);

    // .gitignore should exist and contain TASK.md
    const gitignorePath = join(tempDir, ".gitignore");
    assert.ok(existsSync(gitignorePath), ".gitignore should exist");
    const content = readFileSync(gitignorePath, "utf-8");
    assert.ok(content.includes("TASK.md"), ".gitignore should contain TASK.md");

    // notify called once (changed=true path)
    assert.equal(notifyCalls.length, 1);

    // sent message contains the request and skill path
    assert.equal(sentMessages.length, 1);
    const msg = sentMessages[0]!;
    assert.ok(
      msg.includes("add a health endpoint"),
      "message should contain the request",
    );
    assert.ok(
      msg.endsWith("skills/microspec-brief/SKILL.md") ||
        msg.includes(join("skills", "microspec-brief", "SKILL.md")),
      "message should reference the microspec-brief skill path",
    );

    // Verify the skill file exists on disk by extracting the path from the message
    // Use the actual path from the message — it's an absolute path
    const match = msg.match(/\/[\w/.-]+skills\/microspec-brief\/SKILL\.md/);
    assert.ok(
      match,
      "message should contain an absolute path ending with skills/microspec-brief/SKILL.md",
    );
    assert.ok(
      existsSync(match![0]!),
      "the microspec-brief SKILL.md should exist on disk",
    );
  });

  it("is idempotent — second call does not notify again", async () => {
    setupRepo();

    const { pi, commands } = createMockPi();
    factory(pi as never);

    const notifyCalls: string[] = [];
    const ctx = {
      cwd: tempDir,
      ui: {
        notify: (msg: string) => {
          notifyCalls.push(msg);
        },
      },
      isProjectTrusted: () => true,
    } as never;

    const brief = commands.get("microspec.brief")!;

    // First invocation
    await brief.handler("add a health endpoint", ctx);
    assert.equal(notifyCalls.length, 1);

    // Second invocation — should NOT notify again
    await brief.handler("add a health endpoint", ctx);
    assert.equal(
      notifyCalls.length,
      1,
      "notify should not be called again on idempotent run",
    );

    // .gitignore should still have exactly one TASK.md entry
    const content = readFileSync(join(tempDir, ".gitignore"), "utf-8");
    const taskLines = content.split("\n").filter((l) => l.trim() === "TASK.md");
    assert.equal(
      taskLines.length,
      1,
      ".gitignore should have exactly one TASK.md entry",
    );
  });
});

describe("microspec.execute handler", () => {
  function setupRepo() {
    mkdirSync(join(tempDir, ".git"));
  }

  it("sends message referencing microspec-execute SKILL.md and does not notify", async () => {
    setupRepo();

    const { pi, commands, sentMessages } = createMockPi();
    factory(pi as never);

    const notifyCalls: string[] = [];
    const ctx = {
      cwd: tempDir,
      ui: {
        notify: (msg: string) => {
          notifyCalls.push(msg);
        },
      },
      isProjectTrusted: () => true,
    } as never;

    const execute = commands.get("microspec.execute")!;
    await execute.handler("", ctx);

    // No notify — TASK.md is already ignored after ensureTaskIgnored
    assert.equal(
      notifyCalls.length,
      0,
      "execute handler should not call notify",
    );

    // Sent message references the microspec-execute SKILL.md path
    assert.equal(sentMessages.length, 1);
    const msg = sentMessages[0]!;
    const match = msg.match(/\/[\w/.-]+skills\/microspec-execute\/SKILL\.md/);
    assert.ok(
      match,
      "message should contain an absolute path ending with skills/microspec-execute/SKILL.md",
    );
    assert.ok(
      existsSync(match![0]!),
      "the microspec-execute SKILL.md should exist on disk",
    );
  });
});

describe("microspec.retro handler", () => {
  it("sends message referencing microspec-retro SKILL.md and does not create .gitignore", async () => {
    const { pi, commands, sentMessages } = createMockPi();
    factory(pi as never);

    const ctx = {
      cwd: tempDir,
      ui: {
        notify: (_msg: string) => {},
      },
      isProjectTrusted: () => true,
    } as never;

    const retro = commands.get("microspec.retro")!;
    await retro.handler("", ctx);

    // Sent exactly one message
    assert.equal(sentMessages.length, 1);
    const msg = sentMessages[0]!;

    // Message references the microspec-retro SKILL.md path
    const match = msg.match(/\/[\w/.-]+skills\/microspec-retro\/SKILL\.md/);
    assert.ok(
      match,
      "message should contain an absolute path ending with skills/microspec-retro/SKILL.md",
    );

    // Does not create .gitignore — retro never creates TASK.md
    assert.ok(
      !existsSync(join(tempDir, ".gitignore")),
      "retro handler should not create .gitignore",
    );
  });
});
