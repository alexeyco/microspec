---
name: microspec-brief
description: "Brief a task via /microspec.brief — interview the user, research the codebase, and produce one executable TASK.md."
---

# microspec-brief

Interview the user, research the codebase in parallel, and produce one executable `TASK.md`
at the repo root.

## Flow

### 1. Scope check

Detect a multi-capability request. Signals: 2+ capabilities with their own consumers or
data; acceptance criteria clustering per capability; one capability cuttable without
rewriting the others.

If detected — do NOT continue to the interview. Show a capability map:

| Capability   | Responsibility            | Depends on        |
| ------------ | ------------------------- | ----------------- |
| <capability> | <one-line responsibility> | <capability \| —> |

Plus a one-line build order (dependency direction, no cycles — two capabilities that each
need the other are one capability). Ask the user to choose:
(a) brief one capability now, in build order, one TASK.md per `/microspec.brief` run — recommended;
(b) narrow this run to a single capability the user names.

If not detected: proceed silently. One TASK.md per run.

### 2. Git-ignore precondition

Verify TASK.md is git-ignored:

```bash
git check-ignore -q TASK.md
```

Skip silently when no git repo exists (no `.git` in any ancestor). If the check fails inside
a repo, the orchestrator should have already handled this via `ensureTaskIgnored`; proceed
regardless — this is a defensive verification, not a hard gate.

### 3. Existing TASK.md check

If `TASK.md` exists with `status` ≠ `done`: ask the user — **overwrite**, **resume**, or
**abort**. Respect the choice before proceeding.

### 4. Elicit and research

Interview the user in rounds. Each round follows this discipline:

- **First message**: one line offering the opt-out ("say so and I will proceed on my own
  guesses, marked `ASSUMPTION:` in TASK.md") + the first question. Nothing else.
- **Every question carries a recommended answer**, worded so "yes" accepts it:
  `Q1 <question> → <recommended answer, one line>`. The user reacts faster to a wrong guess
  than they generate an answer from scratch. Numbered options only when the choice set is
  enumerable; never attach a menu to a question about intent or motivation — options steer.
- **Round = the frontier**: ask only questions whose prerequisites are already settled. A
  question whose answer depends on another open question belongs to a later round. At most
  5 questions per round; then wait.
- **Facts are the agent's job, decisions are the user's.** Never ask what the repo can
  answer. A research result still running does not stall the rest of the frontier; a
  question that needs it waits for the next round.
- **Coverage scan before each round**: mark each contract section — Goal, Non-goals,
  Context, Guardrails, Acceptance criteria, Delivery — as `Clear` / `Partial` / `Missing`
  from answers plus research. Ask only about `Partial` and `Missing`. Do not re-ask
  `Clear`. Delivery is a decision, never a fact — research must not answer it and the
  coverage scan cannot mark it `Clear` from the repo.
- **Reframe vague asks into measurable targets** and confirm them: `"make the dashboard
faster"` → `LCP < 2.5s on 4G, initial load < 500ms — are these the right targets?`
  Every acceptance criterion must end up observable.
- **Delivery question**: mandatory, never skipped. Ask like every other question with a
  recommended answer (`→ recommended: commit only, no push`). The interview does not end
  while Delivery is `Missing`.
- **Stop test**: stop when every section is `Clear` and you can predict the user's answers
  to the next three questions you would ask. Floor: if three rounds pass and you still
  cannot predict them, stop and say that something foundational is missing — ask what.
- **False yes** — these are not approval: "whatever you think is best", "sounds good",
  "sure, let's go", silence then "okay let's start". Re-ask with two concrete options.
- **Label guesses.** Anything inferred goes to the drafter as `ASSUMPTION:` — never written
  as if the user said it.

Dispatch `microspec-researcher` subagents — one per independent unknown area — **in a single
parallel batch**, while the first question round is pending.

Dispatch mechanics:

- **OpenCode**: `task` tool with agent `microspec-researcher`.
- **Pi**: `microspec_task` tool with role `microspec-researcher`.

Each prompt lists the exact questions to answer with paths and facts.

**Playback gate** — after the interview, before `microspec-planner`:

Restate the intent in 5–8 lines with exactly these fields:
`Outcome` / `Why now` / `Success` / `Constraints` / `Out of scope` / `Delivery`.
`Out of scope` and `Delivery` are mandatory. Ask for confirmation and wait. Approval covers
only what was shown — a description not written is not approved. Confirmed playback text
goes to the planner and drafter verbatim.

### 5. Plan

Dispatch `microspec-planner` with the complete interview transcript, all research reports,
and the delivery decision.

- **OpenCode**: `task` tool with agent `microspec-planner`.
- **Pi**: `microspec_task` tool with role `microspec-planner`.

The planner returns the Plan skeleton (steps with deps, Owner, Evidence, Interface,
`Delivery:` marker) inside one ` ```markdown ` fence.

### 6. Draft

Dispatch `microspec-drafter` with the complete interview transcript, all research reports, and the
planner's Plan skeleton.

- **OpenCode**: `task` tool with agent `microspec-drafter`.
- **Pi**: `microspec_task` tool with role `microspec-drafter`.

The drafter writes the FULL draft around the plan — formalizes Goal, Non-goals, Context,
Given/When/Then acceptance criteria, and Guardrails, and integrates the planner's steps as
the Plan section. The drafter may reword step summaries but preserves deps, Owner, Evidence,
and Interface structure.

The drafter returns the entire TASK.md inside one ` ```markdown ` fence.

### 7. Critique loop

Dispatch `microspec-critic` on the draft.

- **OpenCode**: `task` tool with agent `microspec-critic`.
- **Pi**: `microspec_task` tool with role `microspec-critic`.

On `VERDICT: NEEDS-FIX`: route each violation to the correct fixer:

- **Plan-section violations** (deps, Owner, Evidence, step structure) → dispatch
  `microspec-planner` to fix the Plan skeleton only.
- **All other violations** → dispatch `microspec-drafter` with the violation list appended to the
  prompt.

Critic-fix dispatches for independent violations may batch together. At most **3 rounds**.
Then proceed with the best draft and note residual violations to the user.

### 8. Finalize

The orchestrator itself writes `TASK.md` at the repo root (subagents never write files):

1. Set `status: draft`, fill `created` and `updated` with current ISO-8601 timestamps.
2. Run `microspec_validate_task` on the written TASK.md.
   - **INVALID** → feed the violations to one more `microspec-drafter` fix round, rewrite, and
     re-validate. Repeat until VALID.
   - **VALID** → proceed to user approval.
3. Present a section-by-section summary to the user. Any `ASSUMPTION:` line surviving in
   Context must be listed explicitly and confirmed by the user before `status: ready`.
4. Ask for approval. On approval: set `status: ready`, refresh `updated`.
5. Tell the user to run `/microspec.execute`.

Nothing gets built in this turn — no scaffolding, no dependency installs, no implementation.
Approval only flips `status` to `ready`; building is `/microspec.execute`.

## Parallelism rule

Independent dispatches always go out in **one batch** (single wave), never sequentially.
When multiple `microspec-researcher` lookups are independent, issue them in the same assistant
message so the platform runs them in parallel. The planner is sequential between research
and drafter — it runs after research completes and before the drafter starts. Critic-fix
dispatches for independent violations may batch together. Scope check and playback gate are
user-facing pauses, not dispatches.
