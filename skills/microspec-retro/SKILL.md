---
name: microspec-retro
description: "Run a retrospective via /microspec.retro — turn one run's evidence into ranked findings in four fixed sections, one issues link at the top of the report, nothing applied."
---

# microspec-retro

Analyze one finished or blocked run's evidence and produce ranked improvements to this
plugin, plus notes for the host repo's task environment. Read-only: a retro edits nothing.

## Flow

### 1. Mode

`TASK.md` present → full mode (journal + counters + session). Absent → session-only mode:
state plainly which evidence is unavailable and work from the conversation and the repo.
A `status: blocked` run is a valid retro target and usually the most informative one.
Best run in the same session, before the context is cleared.

### 2. Compile the evidence bundle

The orchestrator compiles this — subagents cannot see the session. Collect in order, only
what exists:

- TASK.md verbatim essentials: status, ticked vs unticked steps, the Result journal lines.
- Run counters: interview rounds and questions asked, playback corrections, critic rounds,
  fix rounds and retries per step, verifier FAILs, stops fired, re-plans, guardrail blocks.
- Session friction only the orchestrator witnessed: questions the user repeated or rejected,
  false approvals, assumptions the user overturned, steps serialized that could have shared
  a wave.
- `git diff --stat` and the commands that produced evidence.
- Repo environment facts: test/lint/typecheck/build/CI/coverage commands, hooks,
  `AGENTS.md`/`CONTRIBUTING.md` rules.
- Plugin paths implicated: `skills/`, `agents/`, `core/contract.ts`, `scripts/check.mjs`.

Bundle rule: quote decisive lines, never paste whole files or raw logs.

### 3. Dispatch `microspec-retrospector`

One dispatch with the whole bundle in the prompt. That prompt must embed the
§Issue shape block and the §Categories table verbatim — the retrospector learns the
finding shape and the category vocabulary from the dispatch prompt, never from its own
file, so the prompt is the only channel that carries them.

- **OpenCode**: `subagent` tool with agent `microspec-retrospector`; the plugin forces
  background dispatch, so the call returns `{ sessionID, status: "running" }` immediately
  and the result arrives as a completion notification.
- **Pi**: `microspec_task` tool with role `microspec-retrospector`.

### 4. Rank and present

The report is exactly this, in order: the §Report header line printed once at the top,
then each finding rendered in the shape defined in §Issue shape below, then the
retrospector's closing line — `SUMMARY:` or `NOTHING TO CHANGE`, both defined in
`agents/microspec-retrospector.md`. A zero-finding report is the header line plus that
closing line. Severity order, most severe first; at most 10 findings, and when any are
cut, state how many were dropped and why. No per-finding links, no offer step, no `gh`
invocation — the one header link is the report's only issue mechanic.

### 5. Apply nothing

The retro proposes, the user decides. The plugin normally lives in a read-only install
directory, so hand over copy-pasteable rule text and check specs, not edits. When the cwd
**is** the plugin repo, findings may name exact files and rule text so the user can carry
them into a `/microspec.brief` run.

### 6. Journal and artifact

When TASK.md exists, the orchestrator appends one append-only line
`- <ISO timestamp> retro: <n> findings — <top item>` to Result. The orchestrator owns every
TASK.md edit; the status does not change. Write a file only when the user asks and names
the path.

## Issue shape

The single canonical shape of every finding this retro produces. The report the user
reads in chat and the issue that gets filed are the same text — one format, one
rendering, never two shapes for one finding. Verbatim shape:

```
### [<severity>] <imperative title, ≤ 70 chars>

## What happened

> <quoted decisive line> — `<path>:<line>`

## Why it matters

<1–3 sentences: what this cost the run and why it must not happen again.>

## How to fix

<the exact change: file, and the rule sentence or check text to add, change, or delete.>

## How to verify

- [ ] <command + expected output, or Given/When/Then>
```

Hard rules: no finding without a quoted line and `path:line` under `## What happened`;
no finding without at least one `- [ ]` checkbox under `## How to verify`; at most 10
findings, with the dropped count stated; severity is one word — `high`, `medium`,
`low` — and travels as the GitHub label `microspec:<severity>` and as the chat prefix
`[high]` before the title; nothing else is metadata.

### Report header

One line above every finding, printed exactly once at the top of the report and nowhere
else in it:

```
Issues: https://github.com/<owner>/<repo>/issues — file any finding here with label microspec:<severity>; findings for your own repo are advice only.
```

`<owner>/<repo>` comes from the plugin package's own `package.json` `repository` field.
The package root is two directories above the skill file, so the field is read there —
never from the cwd's `git remote`. A finding whose target is the user's own repo
(`repo environment` category) is advice only; the header line already says so.

### Label vocabulary

`microspec:high|medium|low` for severity; `microspec:in-progress` when a run picks the
issue up; `microspec:wontfix` on a closed-with-reason issue. Issue state carries
open/closed; no other fields.

## Categories

| Category           | Use when                                                         | Target                                       |
| ------------------ | ---------------------------------------------------------------- | -------------------------------------------- |
| `contract gap`     | Critic or `microspec_validate_task` let a TASK.md defect through | Contract rules 7–12, `core/contract.ts`      |
| `role gap`         | A subagent did what its prompt should have forbidden             | That `agents/*.md`                           |
| `dead rule`        | An instruction changed nothing this run                          | Delete it (token economy)                    |
| `plan quality`     | A step was too large, ambiguous, or missing `Interface:`         | `microspec-planner`, contract rules 8–9      |
| `evidence quality` | An `Evidence:` line named a nonexistent command or stale run     | `microspec-researcher`, `microspec-verifier` |
| `flow friction`    | Interview asked what the repo knew, playback needed correcting   | `microspec-brief`, `microspec-execute`       |
| `repo environment` | No lint/CI/hooks, no quality bar, rules only in someone's head   | Host repo's `AGENTS.md`, CI, next Guardrails |

## Rules

- Evidence or it did not happen — every finding quotes a decisive line from the bundle.
- One run is a sample of one — mark `single-run` unless the same evidence appears twice.
- Never propose product-code changes.
- Never weaken a rule to make a run look clean.
- Read-only — a retro edits nothing except the one Result line.
- Keep the bundle small: quoted lines, not files.
- One format, one rendering — a finding is reported in the §Issue shape and never in
  another; a finding without a quoted line and `path:line` under `## What happened`, or
  without a `- [ ]` checkbox under `## How to verify`, is not a finding.
