---
name: microspec-retro
description: "Run a retrospective via /microspec.retro — turn one run's evidence into ranked improvements to this plugin, offered as ready-to-file GitHub issues."
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

One dispatch with the whole bundle in the prompt.

- **OpenCode**: `task` tool with agent `microspec-retrospector`.
- **Pi**: `microspec_task` tool with role `microspec-retrospector`.

### 4. Classify

Restate the three-way split:

- **Mechanical** → deterministic check: `core/contract.ts` validation rule,
  `scripts/check.mjs` rule, or repo lint/CI check. Prefer building the check over writing
  a rule.
- **Judgment** → one prompt rule in the exact `agents/*.md` or `skills/*/SKILL.md`, quoted
  as the sentence to add.
- **Dead rule** → delete it, naming file and line.

### 5. Rank and present

Render each finding in the issue shape defined in §Issue shape and filing below.
Severity order, most severe first; at most 10; state how many were dropped and why.

### 6. Offer issue creation

Print the prefilled GitHub issue link under each finding (none for `repo environment`
findings — those target the user's own repo), then the single offer question:
`(1) all (2) numbered, e.g. 1,3 (3) skip — recommended: 1 and 2 for high`. On
acceptance: one `gh issue create` per accepted finding, in report order, when `gh` is
available — then list the created issue numbers; otherwise tell the user the printed
links are the path. A retro still edits nothing except the one `retro:` journal line
already defined.

### 7. Apply nothing

The retro proposes, the user decides. The plugin normally lives in a read-only install
directory, so hand over copy-pasteable rule text and check specs, not edits. When the cwd
**is** the plugin repo, findings may name exact files and rule text so the user can carry
them into a `/microspec.brief` run.

### 8. Journal and artifact

When TASK.md exists, the orchestrator appends one append-only line
`- <ISO timestamp> retro: <n> findings — <top item>` to Result. The orchestrator owns every
TASK.md edit; the status does not change. Write a file only when the user asks and names
the path.

## Issue shape and filing

Canonical shape for the GitHub issues this plugin files about itself. The report the user
reads in chat and the issue that gets filed are the same text — one format, one rendering,
never two shapes for one finding.

### Issue body

Title: imperative, ≤ 70 chars, names the change. Body, verbatim shape:

```
> <quoted decisive line> — `<path>:<line>`

<1–3 sentences: why it matters and exactly what to change. For a mechanical finding
the copy-pasteable check text; for a judgment finding the exact rule sentence and its
file; for a dead rule the line to delete.>

## Acceptance

- [ ] <command + expected output, or Given/When/Then>
```

Hard rules: no finding without a quoted line and `path:line`; no finding without at
least one Acceptance checkbox; severity is one word — `high`, `medium`, `low` — and
travels as the GitHub label `microspec:<severity>` and as the chat prefix `[high]`
before the title; nothing else is metadata.

### Chat rendering

Each finding rendered as (this IS the issue body, plus the link below it):

```
### [high] <title>

> <quote> — `path:line`

<why + change>

## Acceptance

- [ ] <check>

Issue: https://github.com/<owner>/<repo>/issues/new?title=<urlencoded title>&body=<urlencoded body>&labels=microspec%3Ahigh
```

Once after the whole report (not per finding), the offer:
`Create these issues? (1) all (2) numbered, e.g. 1,3 (3) skip — recommended: 1 and 2 for high`.

### Link construction

`<owner>/<repo>` is resolved from the plugin package's own `package.json` `repository`
field (the package root is two directories above this file), never from the cwd's
`git remote`. Title and body URL-encoded; labels as `microspec%3Ahigh`. Findings whose
target is the host repo (`repo environment` category) get no prefilled link — they are
advice for the user's own repo; say so in one line under them.

Creation: `gh issue create --title … --body … --label microspec:<severity>` when `gh`
exists and is authenticated; otherwise the printed link is the path — say so. The same
two shapes ship as repository templates — `.github/ISSUE_TEMPLATE/improvement.md` and
`.github/PULL_REQUEST_TEMPLATE.md` — so hand-filed issues and PRs match what the flows
produce.

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
- One format, one rendering — a finding is reported in the issue shape and never in
  another; a finding without a quote or without Acceptance is not offered as an issue.
- Creation is an external write, so it happens only through the offer or an explicit yes.
