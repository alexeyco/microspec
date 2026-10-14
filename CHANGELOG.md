# Changelog

## 0.1.0

Initial release. Task Contract — a task-scoped Micro-SDD flow: `/microspec.brief` turns a request
into one executable `TASK.md`, `/microspec.execute` runs it through dependency-ordered waves of
parallel subagents, `/microspec.retro` turns the run's evidence into ranked improvements.
Available on OpenCode v2 (plugin) and Pi (extension). Roles are model-agnostic and inherit the
session model.

### Commands

- `/microspec.brief` — scope check, interview, parallel research, plan, draft, critique loop,
  mechanical validation, user approval. Writes `TASK.md` at the repo root with `status: draft`,
  then `ready`. Nothing is built in the briefing turn.
- `/microspec.execute` — dependency-ordered waves of parallel subagents, per-wave verification,
  final review, append-only journaling into `Result`, `status: done` only when every acceptance
  criterion has a verifier `PASS`.
- `/microspec.retro` — read-only retrospective on the finished or blocked run. Works with or
  without `TASK.md`; most useful in the same session, before the context is cleared. Findings
  arrive as ready-to-file GitHub issue bodies, each with a prefilled creation link.

### Skills

- `microspec-brief` — briefing flow: scope check → interview → playback gate → research → plan +
  draft → critique → validated `TASK.md`.
- `microspec-execute` — execution flow: waves → verification → review → stops and guardrail
  handling → `Result`. Delivery drafts a PR body (`What` / `Why` / `Verified` /
  `Look here first`) and offers `gh pr create` with a prefilled compare link.
- `microspec-retro` — retrospective flow: evidence bundle → `microspec-retrospector` → ranked,
  classified findings, each rendered in the GitHub issue shape with a prefilled `issues/new`
  link to the plugin repository and one offer to create (`gh issue create` when available,
  the link otherwise); host-repo findings come without links. Proposes, never applies.
- `task-contract` — canonical `TASK.md` specification: sections, plan-step format, status
  vocabulary, validation rules, worked example.

### Roles

Nine subagent roles, defined in `agents/*.md` as the single source of truth consumed by both
adapters. All ship with `mode: subagent` in frontmatter; behavior is bounded by the role prompt,
the injected `SUBAGENT_CONTRACT`, and the task's Plan and Guardrails — not by host tool or
permission sets.

- `microspec-researcher` — verifiable facts with paths and line refs, plus the project's quality
  bar reported as exact command lines ready for `Evidence:`. Read-only.
- `microspec-planner` — dependency-aware Plan skeleton: one reasonable action per step, vertical
  slices, `Interface:` lines where a dependent step consumes the output, `Delivery:` marker
  always last. Re-plans remaining work on dead-ends.
- `microspec-drafter` — full `TASK.md` draft: vague asks reframed into measurable criteria,
  unverified premises labeled `ASSUMPTION:`, planner's `Delivery:` marker preserved verbatim.
- `microspec-critic` — one pass over the eight contract sections, mechanical and drafting-level
  rules 7–13 including delivery marker; `VERDICT: CLEAN` or `VERDICT: NEEDS-FIX`.
- `microspec-implementer` — exactly one plan step, with `Choices:` reported for every decision
  taken where the contract was silent. Never lowers the quality bar to reach green.
- `microspec-verifier` — acceptance criteria executed as Given/When/Then; `PASS` only from a fresh
  run in the current session; a PASS obtained by lowering the bar is reported `FAIL`.
- `microspec-reviewer` — cumulative diff against Goal, Guardrails, and acceptance criteria, plus a
  `REVIEW FOCUS:` block for what the contract left unsaid. Findings rendered in the GitHub
  issue shape (as defined by the `microspec-retro` skill) with a prefilled creation link and
  an offer to create. Scoped re-review after a fix round.
- `microspec-docwriter` — documentation brought in sync with implemented behavior.
- `microspec-retrospector` — one run's evidence bundle into at most ten ranked findings, each
  classified mechanical, judgment, or dead rule. Findings rendered in the GitHub issue shape
  with a prefilled `issues/new` link and an offer to create via `gh issue create`. Read-only.

### TASK.md contract

- Header fields are exactly `status`, `created`, `updated`; statuses `draft → ready →
in_progress → done`, with `blocked` reachable from `in_progress`.
- Required sections in execution order: Goal, Non-goals, Context, Plan, Guardrails, Acceptance
  criteria, Result.
- Context holds verifiable facts as plain bullets and unverified premises as `ASSUMPTION:` lines,
  each with a confirmation method and confirmed by the user before `status: ready`.
- Plan steps declare `deps`, `Owner`, `Evidence`, and an optional `Interface:` line; steps are
  sliced vertically and split when a summary contains "and", touches more than ~5 files, or needs
  more than 3 acceptance bullets.
- Plan ends with a `Delivery:` marker — `commit + push`, `commit only`, or `none` — recorded
  from the user's briefing decision; a non-`none` marker requires a matching final delivery
  step; `none` requires a Guardrails prohibition on committing and pushing.
- Guardrails have two tiers: a plain imperative is a hard prohibition (`status: blocked` on
  violation); the `[ask]` prefix pauses execution and asks the user.
- Acceptance criteria are Given/When/Then, one observable behavior each, with a number wherever
  the requirement implies one.
- Result is an append-only journal with the kinds `wave`, `ruling:`, `choice:`, `stop:`,
  `re-plan:`, `retro:`. Ticked checkboxes are the completion state; the journal is history.
- Validation is split: mechanical rules 1–6 are enforced by `microspec_validate_task`
  (`core/contract.ts`), drafting-level rules 7–13 by `microspec-critic`.

### Briefing and execution discipline

- Every interview question carries a recommended answer, worded so "yes" accepts it; a round asks
  only frontier questions whose prerequisites are settled, at most 5 per round; a coverage scan
  marks each contract section `Clear` / `Partial` / `Missing`; the stop test is checkable — every
  section `Clear` and the next three answers predictable. Polite non-answers are not approval.
- The delivery decision (`commit + push`, `commit only`, `none`) is mandatory in every briefing,
  asked with a recommended answer, never answered by research, and carried into the Plan as a
  `Delivery:` marker.
- Facts come from the repo via `microspec-researcher`; decisions come from the user.
- A playback gate restates intent as `Outcome` / `Why now` / `Success` / `Constraints` /
  `Out of scope` / `Delivery` and is confirmed before planning starts.
- The drafter⇔critic loop keeps ≤ 3 rounds; the orchestrator then writes `TASK.md` and gates on
  `microspec_validate_task`.
- Execution stops for the user in exactly four situations: an irreversible or destructive action,
  a security-sensitive change, an external side effect, a plan broken beyond guessing.
- One fix round per failure, at most two per step, then user-approved re-planning; `blocked` only
  when re-plan failed twice or the user rejects without an alternative.

### Tools

- `microspec_task` (Pi) — nested subagent runner via `createAgentSession`, with
  `SUBAGENT_CONTRACT` appended to the child system prompt. OpenCode uses its own `task` tool.
- `microspec_validate_task` (both hosts) — mechanical contract validation; reports
  `VALID status=<status>` or `INVALID <n> violation(s): …` followed by a numbered list.

### Misc

- `/microspec.brief` adds `TASK.md` to `.gitignore` when the entry is missing
  (`ensureTaskIgnored`), idempotently.
- Repo layout tree lives in `CONTRIBUTING.md`.
- GitHub templates `.github/ISSUE_TEMPLATE/improvement.md` and
  `.github/PULL_REQUEST_TEMPLATE.md`
  carry the same issue and PR shapes the flows produce, so hand-filed issues and PRs match.
