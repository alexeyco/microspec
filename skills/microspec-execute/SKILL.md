---
name: microspec-execute
description: "Execute TASK.md via /microspec.execute — run dependency-ordered waves of parallel subagents with verification and evidence."
---

# microspec-execute

Run `TASK.md` through dependency-ordered waves of parallel subagents with verification and
evidence, journaling into the Result section.

## Flow

### 1. Read and parse TASK.md

Parse `TASK.md` at the repo root (the task-contract skill defines the format).

- **Missing** → tell the user to run `/microspec.brief` and stop.
- **status: draft** → ask approval first; on approval set `status: ready`.
- **status: done** → ask whether to re-run.
- **status: blocked** → show the blocking Result entries; ask how to proceed.

### 2. Validate contract

Run `microspec_validate_task` on TASK.md before any execution begins.

- **INVALID** → stop, report the numbered violations to the user, suggest a `/microspec.brief` fix
  round. Do not proceed.
- **VALID** → continue.

### 3. Start execution

Set `status: in_progress`, refresh `updated`.

### 4. Wave planning and dispatch

The Plan section is the single place defining execution order and parallelism; waves are
derived entirely from step `deps` — no other file or section prescribes waves independently.
Read `Delivery:` from the Plan — it is the user's recorded delivery decision.

Topologically group Plan steps by `deps`:

- One **wave** = all steps whose deps are already complete.
- Dispatch one subagent per step using the role named in the step's `Owner` field, the whole
  wave in a **single parallel batch**. On OpenCode the batch is one set of background
  dispatches, each returning immediately with `sessionID` and status `running` — record
  each returned `sessionID` keyed to its step id, for the resumes in §8. Every Plan step
  is guaranteed to have an Owner (contract rule).
- On OpenCode, wave results are collected from subagent **completion notifications** — never
  by polling or synchronous waiting. The next wave starts only once every notification for
  the current wave has arrived.

Dispatch mechanics:

- **OpenCode**: `subagent` tool with the step's Owner as agent id; background
  dispatch returns immediately with `sessionID` and status `running`.
- **Pi**: `microspec_task` tool with the step's Owner as role.

Each prompt contains:

- The step text verbatim from the plan.
- The Guardrails section verbatim from TASK.md.
- Relevant Context lines from TASK.md.

**Dependency guard.** Before dispatching a wave, verify every `deps` reference resolves to a
known step id. A dangling dep (unknown S-id) or a dependency cycle → do not dispatch that
step; append `- <ISO timestamp> stop: <step id> — <dangling dep | cycle> — <question>` to
Result, ask the user, and still run the rest of the wave. Re-planning (§8) is the fallback
only when blocking that one step does not unblock the wave.

### 5. Step completion state

When a step's implementer reports success and its evidence checks out, tick its checkbox:
`- [ ]` → `- [x]`. On resume or blocked re-entry, completed steps are identified by ticked
checkboxes — the Result journal is history, checkboxes are state.

### 6. Verify and review

After each wave — on OpenCode, once every completion notification for the wave's dispatches
has arrived; notifications, not polling, tell you a dispatch is done:

- Dispatch `microspec-verifier` **in parallel** — one per affected acceptance criterion,
  in one batch; on OpenCode these are background dispatches whose results are collected
  from completion notifications the same way.
  - **OpenCode**: `subagent` tool with agent `microspec-verifier`; background
    dispatch returns immediately with `sessionID` and status `running`.
  - **Pi**: `microspec_task` tool with role `microspec-verifier`.

After the **final wave**:

- Dispatch `microspec-reviewer` once on the cumulative diff.
  - **OpenCode**: `subagent` tool with agent `microspec-reviewer`; background
    dispatch returns immediately with `sessionID` and status `running`.
  - **Pi**: `microspec_task` tool with role `microspec-reviewer`.

**Delivery step.** When `Delivery:` is `commit + push` or `commit only`, the delivery step
runs in the final wave, after verification and review pass — never before, and never when
a criterion is still `FAIL` or a `BLOCKING` finding is open. An unplanned commit or push
remains an external side effect and still stops for the user. When `Delivery:` is `none`,
committing or pushing is a guardrail breach → `status: blocked`. When a PR is wanted, the
orchestrator drafts its body from what already exists (Goal → What, the Result journal and
step Evidence → Verified, the top `REVIEW FOCUS` item → Look here first, closed issues →
Why), in this shape and nothing else:

```
## What

<one paragraph: the change in user-visible terms>

## Why

<one paragraph — or one line `Closes #42, #57` / `Task: TASK.md — <title>`>

## Verified

- `<command>` → <decisive output line>

## Look here first

<the riskiest hunk, one line — or `none — mechanical change`>
```

Never restate the diff; `Verified` lines are commands actually run in this session. Print
the prefilled compare link — `https://github.com/<owner>/<repo>/compare/<base>...<head>`
with `expand=1`, `title`, `body`, owner/repo from `git remote get-url origin` — and offer
`gh pr create` with its own explicit yes.

**Scoped re-review.** After a fix round the reviewer re-checks only prior findings:
each → `ADDRESSED` or `NOT-ADDRESSED` plus any breakage the fix introduced. No fresh
full-diff review, no new rounds beyond the retry budget.

### 7. AC ledger

Maintain a per-AC verification ledger: each AC → wave/verifier → PASS or FAIL. A wave
verifies the ACs its steps affect. Before setting `status: done`, **every** AC must have at
least one verifier PASS in the ledger. Re-dispatch `microspec-verifier` for any AC that was never
verified.

### 8. Failure handling and re-plan

- Per failing step or criterion: one fix round — dispatch the step's Owner with the
  verifier report appended to the prompt. When continuing that Owner's prior dispatch
  (a fix round on the same step), resume its session by passing the recorded `sessionID`
  to the `subagent` tool. `task_id` is the deprecated v1 name for this field — never
  use it.
- At most two fix rounds per step in total. After the second round fails, or when a
  deadlock/unknown-deps situation the dependency guard cannot resolve by blocking one step
  is detected, dispatch `microspec-planner` (re-planning mission) with the current TASK.md state,
  completion state (ticked checkboxes, Result journal), and failure/verifier reports.
  - **OpenCode**: `subagent` tool with agent `microspec-planner`; background
    dispatch returns immediately with `sessionID` and status `running`.
  - **Pi**: `microspec_task` tool with role `microspec-planner`.
- The orchestrator presents the revised remaining plan to the user.
- On user approval: replace the unticked Plan portion in TASK.md, append a Result journal
  line `re-plan: <replaced ids> → <new ids>`, reset retries for new steps, continue
  execution from the updated plan.
- `blocked` only when re-plan failed twice or the user rejects without an alternative.

**Stops.** Four situations halt the wave for the user — never resolved by orchestrator
or subagent alone:

1. Irreversible or destructive action (data loss, history rewrite, deleting anything the
   task did not create).
2. Security-sensitive change (auth, crypto, secrets, permissions, trust boundaries).
3. External side effect (publish, deploy, mail, spend, third-party writes).
4. Plan broken beyond guessing (step contradicts Goal or contract, deps unsatisfiable).

On a stop: do not dispatch, append `- <ISO timestamp> stop: <reason> — <question>` to
Result, ask. Resume only on answer. Subagents report `BLOCKED: <reason>` on encounter.

**Guardrail tiers.** Plain imperative guardrail = hard prohibition: violation →
`status: blocked`, append reason to Result. `[ask]`-prefixed guardrail: pause, present
the question with two viable options and recommendation, append `stop:` Result line.
On answer continue; rejection without alternative → `status: blocked`.

### 9. Journaling

The orchestrator appends Result entries as events occur — after each wave, and on every
ruling, choice, stop, and re-plan:

```
- <ISO timestamp> wave <n>: <step ids> — <outcome> (evidence: <command/file>)
- <ISO timestamp> ruling: <decision> — <why> — <cost if wrong>
- <ISO timestamp> choice: <S-id> <decision> — <reason>
- <ISO timestamp> stop: <reason> — <question>
- <ISO timestamp> re-plan: <replaced ids> → <new ids>
```

`ruling:` — report contradicts TASK.md, peer report, or contract; contract is
binding authority, orchestrator rules instead of stalling.
`choice:` — from implementer `Choices:` lines; decisions contract did not cover,
user reviews in final report.

The orchestrator owns every TASK.md edit. Subagents only report.

### 10. Completion

All acceptance criteria verified `PASS` (AC ledger complete) and reviewer reports no
`BLOCKING` findings:

- Set `status: done`, refresh `updated`.
- Final user report: completed steps with evidence, `choice:` entries, `ruling:`
  entries, `git diff --stat`.

## Parallelism rule

Steps whose deps are all complete run in **one wave** — dispatch all step Owners for that
wave in a single batch. Independent verifier dispatches within a wave also batch together.
On OpenCode the batch is background dispatches and results are collected from completion
notifications — never poll, never wait synchronously — with the next wave starting only once
every notification for the current wave has arrived. Never dispatch dependent steps
sequentially when they could share a wave.
