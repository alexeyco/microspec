# Task Contract — deep-dive

The TASK.md contract is the single artifact that bridges briefing and execution. This document
defines every field, every section, every validation rule, and shows one complete example.

## Header fields

YAML frontmatter at the top of TASK.md:

| Field     | Type   | Rule                                                       |
| --------- | ------ | ---------------------------------------------------------- |
| `status`  | enum   | `draft` \| `ready` \| `in_progress` \| `blocked` \| `done` |
| `created` | string | ISO-8601 timestamp, set once at creation                   |
| `updated` | string | ISO-8601 timestamp, agents refresh on every status change  |

Agents update `status` and `updated`.

## Status transitions

```text
draft ──user approval──▶ ready ──/microspec.execute──▶ in_progress ──all AC PASS──▶ done
                           │                        │
                           │                        └──guardrail hit / retries──▶ blocked
                           │
                           └──user may return to draft for edits
```

- `draft` — written by `/microspec.brief`, awaiting user review.
- `ready` — user approved; `/microspec.execute` may begin.
- `in_progress` — execution started; waves are running.
- `done` — all acceptance criteria verified `PASS`, reviewer reports no `BLOCKING` findings.
- `blocked` — a guardrail was violated or retries were exhausted; execution halted.

## Section table

Required H2 sections, in order:

| Section             | Required | Purpose                       | Rule                                                     |
| ------------------- | -------- | ----------------------------- | -------------------------------------------------------- |
| YAML header         | yes      | status, dates                 | Agents update `status` and `updated`                     |
| Goal                | yes      | Desired end state             | One paragraph, no implementation plan                    |
| Non-goals           | yes      | Task boundaries               | Never empty; write `None` when there are none            |
| Context             | yes      | Minimal context for the agent | Facts as bullets; unverified premises as `ASSUMPTION:`   |
| Plan                | yes      | How to reach the result       | Every step has an Owner and Evidence; steps declare deps |
| Guardrails          | yes      | Prohibitions and stop points  | Hard imperatives; `[ask]` prefix = pause point           |
| Acceptance criteria | yes      | What counts as done           | Given/When/Then; one criterion = one observable behavior |
| Result              | yes      | Execution journal             | Filled only during `/microspec.execute`; append-only     |

## Template skeleton

```markdown
---
status: draft
created: <ISO-8601>
updated: <ISO-8601>
---

# <task title>

## Goal

<One paragraph: the desired end state. No implementation plan.>

## Non-goals

- <Out of scope. Never leave empty; write "None" if there is truly nothing.>

## Context

- <Verifiable facts: file paths, commands, versions, observed behavior.>
- ASSUMPTION: <unverified premise> — <how to confirm before status: ready>

## Plan

- [ ] **S1** <one reasonable action> (deps: —)
  - Owner: microspec-implementer
  - Evidence: <command/output/artifact proving the step is complete>
  - Interface: <Consumes … — Produces …; omit when no dependent step consumes this output>

Delivery: <commit + push | commit only | none>

## Guardrails

- <Hard imperative prohibition. No explanations.>
- [ask] <Pause point — /microspec.execute stops and asks the user.>

## Acceptance criteria

- **AC1** Given <state> When <action> Then <observable outcome>

## Result

<!-- Append-only journal. Filled only during /microspec.execute. -->
```

## Plan-step format

Each plan step is a checkbox item with up to four parts:

```markdown
- [ ] **S<n>** <one reasonable action> (deps: — | S<i>, S<j>)
  - Owner: <role-id>
  - Evidence: <command/output/artifact proving the step is complete>
  - Interface: Consumes <names/signatures> — Produces <names/signatures>
```

- **`S<n>`** — sequential step identifier.
- **`deps`** — comma-separated list of prerequisite step ids, or `—` when the step has no
  dependencies. This field drives wave scheduling in `/microspec.execute`: steps whose deps are all
  complete run in parallel as one wave.
- **`Owner`** — the role that executes this step. Values come from the role vocabulary:
  `microspec-researcher`, `microspec-planner`, `microspec-drafter`, `microspec-critic`, `microspec-implementer`, `microspec-verifier`, `microspec-reviewer`, `microspec-docwriter`.
- **`Evidence`** — the concrete proof that the step is done: a command to run, an expected output
  pattern, or an artifact path.
- **`Interface`** (optional) — exact identifiers and signatures this step produces for its
  dependents. Required only when a dependent step consumes what this step produces. Write
  exact names and signatures, not prose. When two steps disagree about a name, that is a
  contract defect — fix the Plan, do not let the implementer choose. The validator does not
  check this line; `microspec-critic` does.
- **Delivery marker** — the Plan section always ends with a `Delivery:` line, the last line of
  the Plan, one of exactly three values: `Delivery: commit + push`, `Delivery: commit only`,
  `Delivery: none`. The marker is not a step — it carries no checkbox, Owner, or Evidence.
  The validator does not check it; `microspec-critic` does.

### Step quality

- **One step = one reasonable action.** A step is right-sized when its implementer can write
  exactly one reasonable thing from it — unambiguous, not exhaustive. A line that decides
  nothing is a gap; a body that the signature and tests already determine is a transcript.
- **Slice vertically.** A step delivers a complete path through the system ("user can create
  an account": schema + API + UI), not a layer ("all the database, then all the API, then
  all the UI").
- **Split a step when** its summary contains "and", it touches more than ~5 files, or its
  acceptance cannot be stated in ≤3 bullets.
- Steps stay small enough for one subagent to finish alone.

### Wave derivation

```text
Wave 1: all steps with deps: —
Wave 2: all steps whose deps ⊆ Wave 1
Wave n: all steps whose deps ⊆ Wave 1 ∪ … ∪ Wave n−1
```

Within each wave, one subagent is dispatched per step using the role named in the step's
`Owner` field, all in a single parallel batch.

## Validation rules

`validateTask(raw)` returns an array of human-readable violation strings. An empty array means
the document is valid. The `microspec_validate_task` tool exposes this check to both skill flows as
the mechanical contract gate. Rules:

1. **Header** parses; `created`, `updated` are non-empty; `status` is in the vocabulary.
2. **All required sections** present as `## <name>` H2 headings.
3. **Goal, Non-goals, Context, Guardrails** are non-empty. Non-goals violation text:
   `Non-goals must not be empty; write "None" when there are none`.
4. **Acceptance criteria** — at least one bullet; every bullet contains `Given`, `When`, `Then`
   (case-insensitive).
5. **Plan** — at least one step (`- [` checkbox line); every step block contains `Owner:` and
   `Evidence:`.
6. **Result** — violation when `status: done` and Result is empty (HTML comments are stripped
   before checking emptiness).

Rules 1–6 are mechanical — enforced by `microspec_validate_task` via `core/contract.ts`.
Rules 7–13 are drafting-level — enforced by `microspec-critic`, not by the validator.

7. **Assumptions** — every unverified premise in Context labeled `ASSUMPTION:` with a
   confirmation method; confirmed by the user before `status: ready`.
8. **Step quality** — one reasonable action per step; vertical slices; split when the
   summary contains "and", touches >~5 files, or acceptance needs >3 bullets.
9. **Interface line** — a step whose output a dependent step consumes carries `Interface:`
   with exact identifiers and signatures.
10. **Guardrail tiers** — plain imperative = hard prohibition; `[ask]` prefix = pause
    point; short imperatives, no explanations.
11. **Criterion falsifiability** — every acceptance criterion states an observable outcome,
    and a number where the requirement implies one; an unfalsifiable criterion is a
    violation.
12. **Plan references** — `Owner` is a role id from the vocabulary; `deps` reference existing step ids or `—`.
13. **Delivery** — the Plan ends with a `Delivery:` marker holding one of the three values
    (`commit + push`, `commit only`, `none`); when it is not `none` a matching final delivery
    step exists with Owner and Evidence; when it is `none` Guardrails forbid committing and
    pushing.

Emptiness checks strip HTML comments and whitespace.

## Completion state

During execution, a ticked checkbox (`- [x]`) means the step is complete. The Result journal
records history; checkboxes are the authoritative state. On resume or blocked re-entry, the
orchestrator reads checkboxes to determine which steps are done.

### Re-planning

When a step exhausts retries or execution dead-ends, `microspec-planner` re-plans the remaining
unticked portion of the Plan. The revised plan replaces the unticked steps and needs user
approval before execution continues. The status becomes `blocked` only when re-plan failed
twice or the user rejected the revised plan. Each re-plan is recorded in the Result journal:

```text
re-plan: <replaced ids> → <new ids>
```

## Example

A complete TASK.md for adding retry logic to an HTTP client:

```markdown
---
status: done
created: 2026-02-14T10:00:00Z
updated: 2026-02-14T11:45:00Z
---

# Add retry logic to the HTTP client

## Goal

The HTTP client in `src/http/client.ts` retries failed requests with exponential backoff for
transient errors (5xx, network timeouts), up to a configurable maximum number of attempts.

## Non-goals

- Changing the public API of the HTTP client.
- Adding retry support for non-GET methods.
- Modifying the logging framework.

## Context

- Entry point: `src/http/client.ts`, function `request()`.
- Current behavior: single attempt, throws on non-2xx or timeout.
- Timeout is configured via `options.timeoutMs` (default 5000).
- Tests run with `npm test`; type-check with `npm run typecheck`.
- ASSUMPTION: The retry module can be a pure function with no side effects — confirm by
  checking that error handling is centralized in `request()`.

## Plan

- [ ] **S1** Create `src/http/retry.ts` with exponential backoff function (deps: —)
  - Owner: microspec-implementer
  - Evidence: `npm test -- --grep "retry"` passes; new file `src/http/retry.ts` exists.
  - Interface: Consumes — Produces `retry<T>(fn: () => Promise<T>, opts: RetryOpts): Promise<T>`

- [ ] **S2** Wire `retry()` into `request()` call path (deps: S1)
  - Owner: microspec-implementer
  - Evidence: `npm test` passes; `request()` calls `retry()` on transient errors.

- [ ] **S3** Add integration tests for retry on 503 and timeout (deps: S2)
  - Owner: microspec-implementer
  - Evidence: `npm test -- --grep "retry integration"` passes with AC1–AC3 coverage.

- [ ] **S4** Commit the change (deps: S1, S2, S3)
  - Owner: microspec-implementer
  - Evidence: `git log -1 --stat` shows the change; `git status -sb` reports a clean tree

Delivery: commit only

## Guardrails

- Do not change the `request()` function signature.
- Do not add dependencies.
- Do not modify files outside `src/http/`.
- No new suppressions, no skipped or deleted tests, no moved thresholds.
- [ask] If retry needs to handle non-idempotent methods, pause — scope may need expanding.

## Acceptance criteria

- **AC1** Given a 503 response When `request()` is called Then the client retries up to
  `maxRetries` times before throwing.
- **AC2** Given a network timeout When `request()` is called Then the client retries with
  exponential backoff (delay doubles each attempt).
- **AC3** Given `maxRetries: 0` When `request()` is called Then the client makes exactly one
  attempt with no retry.

## Result

- 2026-02-14T11:00:00Z wave 1: S1 — done (evidence: `src/http/retry.ts` created, unit tests pass)
- 2026-02-14T11:20:00Z wave 2: S2 — done (evidence: `request()` integrates retry, `npm test` green)
- 2026-02-14T11:22:00Z choice: S2 — inlined retry opts instead of shared config — simpler for single call site
- 2026-02-14T11:35:00Z wave 3: S3 — done, AC1–AC3 verified PASS (evidence: `npm test`)
- 2026-02-14T11:42:00Z wave 4: S4 — done (evidence: `git log -1 --stat`, `git status -sb` clean tree)
```

## Guardrails philosophy

Guardrails are short imperatives. They exist to prevent damage, not to explain design
decisions. Two tiers:

- **Hard prohibition** (plain imperative): violating it stops execution with
  `status: blocked`. Write what to **stop** doing, not what to start doing.
- **Pause point** (`[ask]` prefix): `/microspec.execute` stops, presents the user with viable
  options, and continues on the answer. Not a block by itself.

General rules:

- One prohibition per line.
- No rationale — if a guardrail needs an explanation, the task scope is wrong.
- When the task could lower the repo's quality bar, add a hard guardrail: no new
  suppressions, no skipped or deleted tests, no moved thresholds.

## See also

- [README — TASK.md](../README.md#taskmd) — section table overview.
- [docs/agents.md](agents.md) — role catalog and dispatch mechanics.
- [README](../README.md) — install and usage.
