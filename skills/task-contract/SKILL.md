---
name: task-contract
description: "Canonical TASK.md contract — defines the format for drafting, reviewing, and updating TASK.md. Referenced by /microspec.brief and /microspec.execute."
---

# TASK.md contract

Canonical specification for the `TASK.md` file format used by `/microspec.brief` (drafting) and
`/microspec.execute` (execution).

## Sections

| Section             | Required | Purpose                       | Rule                                                     |
| ------------------- | -------- | ----------------------------- | -------------------------------------------------------- |
| YAML header         | yes      | Status, dates                 | Agents update `status` and `updated`                     |
| Goal                | yes      | Desired end state             | One paragraph, no implementation plan                    |
| Non-goals           | yes      | Task boundaries               | Never empty; write `None` when there are none            |
| Context             | yes      | Minimal context for the agent | Facts as bullets; unverified premises as `ASSUMPTION:`   |
| Plan                | yes      | How to reach the result       | Every step has an Owner and Evidence; steps declare deps |
| Guardrails          | yes      | Prohibitions and stop points  | Hard imperatives; `[ask]` prefix = pause point           |
| Acceptance criteria | yes      | What counts as done           | Given/When/Then; one criterion = one observable behavior |
| Result              | yes      | Execution journal             | Filled only during `/microspec.execute`; append-only     |

## Header fields

| Field     | Format     | Notes                          |
| --------- | ---------- | ------------------------------ |
| `status`  | vocabulary | See status transitions below   |
| `created` | ISO-8601   | Set once by `/microspec.brief` |
| `updated` | ISO-8601   | Updated on every status change |

## Status vocabulary and transitions

```
draft → ready → in_progress → done
                        ↘ blocked
```

| Status        | Set by             | Meaning                               |
| ------------- | ------------------ | ------------------------------------- |
| `draft`       | /microspec.brief   | Written, awaiting user approval       |
| `ready`       | user approval      | Approved, ready for execution         |
| `in_progress` | /microspec.execute | Subagent waves are running            |
| `done`        | /microspec.execute | All acceptance criteria verified PASS |
| `blocked`     | /microspec.execute | Guardrail hit or retries exceeded     |

## Plan-step format

```
- [ ] **S<n>** <one reasonable action> (deps: — | S<i>, S<j>)
  - Owner: <role-id>
  - Evidence: <command | output | artifact>
  - Interface: Consumes <names/signatures> — Produces <names/signatures>
```

- `deps`: `—` for no dependencies, or comma-separated step IDs (`S1`, `S2`).
- `Owner`: one of `microspec-researcher`, `microspec-drafter`, `microspec-critic`, `microspec-implementer`,
  `microspec-verifier`, `microspec-reviewer`, `microspec-docwriter`, `microspec-planner`.
- `Evidence`: concrete command, expected output, or artifact path proving completion.
- `Interface` (optional): exact identifiers and signatures a step produces for its
  dependents. Omit when no dependent step consumes this step's output.
- `deps` drives wave scheduling in `/microspec.execute`: steps whose deps are all complete run in
  parallel within one wave.
- The Plan skeleton is authored by `microspec-planner` during `/microspec.brief` and may be revised by
  `microspec-planner` re-plans during `/microspec.execute` (user-approved).
- **One step = one reasonable action.** A step is right-sized when its implementer can
  write exactly one reasonable thing from it. A line that decides nothing is a gap; a
  body that the signature and tests already determine is a transcript.
- **Slice vertically.** A step delivers a complete path through the system, not a layer.
  Split a step whose summary contains "and", touches more than ~5 files, or whose
  acceptance cannot be stated in ≤3 bullets.
- **Delivery marker.** The Plan section always ends with a `Delivery:` line — the last line
  of the Plan, one of exactly three values: `Delivery: commit + push`, `Delivery: commit only`,
  `Delivery: none`. The marker is not a step — it carries no checkbox, Owner, or Evidence.
  The validator does not check it; `microspec-critic` does.

## Validation rules

1. **Header**: parses as YAML; `status`, `created`, `updated` non-empty; `status` in the
   vocabulary.
2. **Sections**: all of Goal, Non-goals, Context, Plan, Guardrails, Acceptance criteria,
   Result present as `## <name>` H2 headings.
3. **Non-empty**: Goal, Non-goals, Context, Guardrails must have content. Non-goals
   violation: _"Non-goals must not be empty; write 'None' when there are none"_.
4. **Acceptance criteria**: ≥ 1 bullet; every bullet contains Given, When, Then
   (case-insensitive).
5. **Plan**: ≥ 1 checkbox step (`- [ ]`); every step block contains `Owner:` and `Evidence:`.
6. **Result**: violation when `status: done` and Result is empty (HTML comments stripped
   before checking).

Rules 1–6 are mechanical — enforced by `microspec_validate_task` via `core/contract.ts`.
Rules 7–13 are drafting-level — enforced by `microspec-critic`, not by the validator.

7. **Assumptions**: every unverified premise in Context labeled `ASSUMPTION:` with a
   confirmation method; confirmed by the user before `status: ready`.
8. **Step quality**: one reasonable action per step; vertical slices; split when the
   summary contains "and", touches >~5 files, or acceptance needs >3 bullets.
9. **Interface line**: a step whose output a dependent step consumes carries `Interface:`
   with exact identifiers and signatures.
10. **Guardrail tiers**: plain imperative = hard prohibition; `[ask]` prefix = pause
    point; short imperatives, no explanations.
11. **Criterion falsifiability**: every acceptance criterion states an observable outcome,
    and a number where the requirement implies one; an unfalsifiable criterion is a
    violation.
12. **Plan references**: `Owner` is a role id from the vocabulary; `deps` reference existing step ids or `—`.
13. **Delivery**: the Plan ends with a `Delivery:` marker holding one of the three values
    (`commit + push`, `commit only`, `none`); when it is not `none` a matching final delivery
    step exists with Owner and Evidence; when it is `none` Guardrails forbid committing and
    pushing.

## Example

```markdown
---
status: draft
created: 2025-07-15T10:00:00Z
updated: 2025-07-15T10:00:00Z
---

# Add GET /health endpoint

## Goal

Add a health-check endpoint returning HTTP 200 with a JSON body so load balancers can verify
the service is running.

## Non-goals

- Database or dependency probes
- Authentication and rate limiting on the health path

## Context

- `src/server.ts` builds routes with `createRouter()`; `jsonResponse()` lives in `src/response.ts`.
- Test runner: `npm test` (node --test).
- ASSUMPTION: the router accepts `router.get(path, handler)` — confirm in `src/server.ts`.

## Plan

- [ ] **S1** Implement `healthHandler` in `src/routes/health.ts` with unit tests (deps: —)
  - Owner: microspec-implementer
  - Evidence: `npm test -- --test-name-pattern health` passes
  - Interface: Produces `healthHandler(req, res): void`
- [ ] **S2** Register `GET /health` in `src/server.ts` (deps: S1)
  - Owner: microspec-implementer
  - Evidence: `curl -s localhost:3000/health` returns `{"status":"ok"}`

Delivery: none

## Guardrails

- Do not modify auth middleware.
- No new suppressions, no skipped or deleted tests, no moved thresholds.
- Do not commit or push.
- [ask] Pause if the endpoint would need dependency checks — scope may need expanding.

## Acceptance criteria

- **AC1** Given the server runs When a client sends `GET /health` Then the status is `200`
  and the body is `{"status":"ok"}`.
- **AC2** Given the server runs When the health endpoint is hit Then the access log records
  the request.

## Result

<!-- Append-only journal. Filled only during /microspec.execute. -->
```

Empty template skeleton and an extended worked example: `docs/task-contract.md`.
