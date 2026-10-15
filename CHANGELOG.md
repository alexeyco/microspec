# Changelog

## 0.5.0

A retro of 0.4.0 collected eighteen findings about the flow breaking its own rules — a TUI
feature that shipped invisible, a task closed with an unfinished step, a verdict of "PARTIAL"
that quietly passed the gate, an orchestrator waiting forever for a crashed agent. All
eighteen are fixed here; where it could be checked by code, it was moved out of advice and
into the validator.

### Task contract

- A criterion wrapped over several lines is checked as one bullet — a "Then" on a continuation
  line no longer fails validation.
- HTML comments do not count: a commented-out "When" can no longer fake a complete criterion.
- A task cannot be marked done while any plan step is unticked; the validator names the step.
  A step you decided to skip is deleted from the plan, never left unchecked.
- Each criterion states exactly one binding thing. A number in parentheses that a later step
  can prove wrong is rejected — write a minimum ("at least one") or a real requirement
  ("exactly 4").
- The critic rejects a criterion that is impossible under the task's own guardrails or with
  the tools the task lists, quoting the conflicting guardrail.

### Agent rules

- Researchers must inspect the environment where the result appears — the host config and the
  other installed extensions that could hide or override the feature. Nobody looked there in
  the last run, and a feature shipped invisible.
- Drafters re-check every file path, line number and version they copy into a task with a
  real command, and mark as an assumption anything they could not check.
- A guardrail must be decidable: a rule like "do not install packages" that leaves agents
  unsure whether `npx` counts is itself a violation.
- Steps that edit the same file stay one step — dependencies express data flow between files,
  never edit order. This removes the worst serialization of the last run: fourteen waves to
  edit one file.
- A plan may only name tools the machine actually has; when a `CHANGELOG.md` exists, changes
  go under the real next version, not "Unreleased".
- Verifiers have two verdicts: PASS or FAIL. "PARTIAL" is gone — half-proven is a FAIL that
  names what is missing, and a claim of "all combinations" must show which ones ran.
- Docwriters cannot reference wording another step owns but has not written yet.

### Execution flow

- `/microspec.brief` ends its turn after approval; it can no longer drift into building.
- `/microspec.execute` on a finished task prints the last journal lines and the results
  instead of an idle "re-run?" prompt.
- Changing the delivery decision mid-run rewrites the task in one edit: the new marker, every
  contradicted guardrail deleted, the change recorded in the journal.
- If a dispatched agent never reports back (crash, abort), the wave no longer waits forever:
  its session is resumed once to check, then the step is marked BLOCKED and handled.
- A task is never done while any criterion lacks a PASS — the gate counts only PASS, and a
  report claiming partial success is a FAIL.
- Journal timestamps come from `date -u`, never from the writer's memory.

### Build

- `make check` no longer reinstalls dependencies after a manifest touch; `make install` does
  that, when you want it.
- `make check` now also checks formatting — prettier is a normal devDependency, `make fmt`
  needs no network fetch, and formatter drift is no longer invisible.

## 0.4.0

On OpenCode, microspec role dispatches now run strictly in background: a new `execute.before`
tool hook forces `background: true` on every `subagent` call targeting a role, so the
orchestrator cannot fall into synchronous waiting even when a call asks for foreground, and the
skills describe the wave mechanics this enables — dispatches return immediately with
`sessionID` and status `running`, wave results are collected from completion notifications
rather than polling, and the next wave starts only once every notification of the current wave
has arrived. OpenCode dispatch wording in all three skills moves to the v2 tool name `subagent`.
Pi is unchanged: `microspec_task` keeps its own synchronous nested runner.

### Plugin enforcement

- New pure helper `forceBackgroundEvent(tool, input, roleIds)` in `opencode/background.ts`
  matches the `subagent` tool and the legacy `task` alias the host still normalizes, reads the
  role from `agent` with `subagent_type` as fallback, and returns a fresh input object with
  `background: true` for any `ROLE_IDS` member — overriding an explicit `background: false` and
  never mutating the original. Everything else passes through by reference.
- `opencode/index.ts` registers the helper on `ctx.tool.hook("execute.before")`, reusing the
  role set already built for `SUBAGENT_CONTRACT` injection.
- `tests/opencode-background.test.ts` — 15 tests over the tool × role-field × background matrix,
  pass-through and non-mutation guarantees; the suite grows from 188 to 203 tests.

### Skill and docs wording

- All nine OpenCode dispatch bullets across the three skills name the `subagent` tool with the
  immediate `{ sessionID, status: "running" }` return; parallel batches are collected from
  completion notifications.
- `/microspec.execute` wave rules: a wave is one batch of background dispatches; results arrive
  as completion notifications — never polled, never awaited synchronously; the next wave starts
  only after every notification of the current wave arrived. The orchestrator records each
  dispatch's `sessionID` keyed to its step id, and a fix-round resume passes that `sessionID`
  (`task_id` is marked as the deprecated v1 field name).
- `docs/agents.md`: the dispatch intro names the `subagent` tool and states that role dispatches
  run in background mode, collected from completion notifications.

## 0.3.0

`/microspec.retro` reports no longer double as issue drafts and no longer offer to file anything:
every finding now arrives in one fixed four-section shape, the report opens with a single issues
link to the plugin repository, and the user files by hand. The finding shape and the category
vocabulary are single-homed in `skills/microspec-retro/SKILL.md` and carried verbatim into the
`microspec-retrospector` dispatch prompt, so the subagent learns them from the prompt alone; the
mechanical/judgment/dead-rule classification is single-homed in `agents/microspec-retrospector.md`.
The GitHub issue template and the prose docs shrink to match.

### Finding shape

- Every finding is rendered in four fixed sections, in order: `## What happened`,
  `## Why it matters`, `## How to fix`, `## How to verify`. The text the user reads in chat and
  the text that gets filed are the same — one format, one rendering, never two shapes for one
  finding.
- `## What happened` must carry the decisive line quoted from the evidence bundle together with
  its `path:line`; a finding without one is not a finding. `## How to verify` must carry at least
  one acceptance checkbox. At most 10 findings, with the dropped count stated when any are cut.
- Severity stays one word — `high`, `medium`, `low` — and travels as the GitHub label
  `microspec:<severity>`; the label vocabulary is unchanged.

### Issue mechanics

- The report prints exactly one issues link, once, at the top; `<owner>/<repo>` is resolved from
  the plugin package's own `package.json` `repository` field, never from the cwd's git remote.
  Findings aimed at the user's own repo are advice only, and the header line says so.
- The per-finding prefilled creation links and the `gh`-based filing offer are removed — the one
  header link is the report's only issue mechanic, and filing is by hand.

### Single homes

- The finding shape block and the category table live only in `skills/microspec-retro/SKILL.md`;
  the dispatch prompt embeds both verbatim, and the prompt is the only channel that carries them
  to the retrospector.
- The mechanical/judgment/dead-rule classification lives only in
  `agents/microspec-retrospector.md`.

### Docs and templates

- `.github/ISSUE_TEMPLATE/improvement.md` is reduced to the four headings — the free-form body
  prose and the separate acceptance section are gone.
- The §microspec-retrospector entry in `docs/agents.md` is reduced to a pointer at the
  single homes; the `/microspec.retro` step in `README.md` is reduced to the four-section
  summary with the single header link, and its two classification-triad tails are dropped.

## 0.2.0

Pi's `microspec_task` no longer stays silent for the tens of seconds a role subagent works and
then dumps a single report: it streams a live trace of the child's work through the parent
session, one line per child tool call, so that during a wave an operator can tell at a glance
which agent is busy and which is stuck. The trace is windowed to the last 8 lines, carries a
`writing report… (N chars)` tail while the child writes text instead of calling a tool, and stays
above the report in the interactive transcript and in the HTML export. Model and formatting live
in a new host-agnostic `core/trace.ts`; the Pi adapter only maps session events onto it. The
release is Pi-only — the OpenCode plugin API offers no way to render inside the host's native
subagent tool call, so OpenCode behavior is unchanged.

### Live trace in `microspec_task`

- One line per child tool call: the tool name, the argument rendered as a per-tool payload
  summary and truncated to 60 characters, the duration (`340ms` below one second, `6.4s` at or
  above, `…` while running) and the status `running` / `ok` / `FAIL`. The summary is the
  `command` for `bash`, the `path` for `write`/`ls`, the `pattern` for `grep`/`find` and
  `path:lines` for `read`/`edit` (e.g. `src/routes/health.ts:1-40`); an unmapped tool whose
  arguments hold exactly one string field shows that value, and anything else falls back to
  compact JSON. Only the first line is kept before truncation.
- Status comes only from the tool result's `isError` flag and the abort state — the child's output
  text is never parsed. Aborting a run closes in-flight entries as `FAIL` without inventing a
  duration.
- Partial results flow through `execute`'s `onUpdate` callback: tool events emit immediately,
  while text-delta progress is throttled to at most one emit per 5 seconds, so a chatty child
  cannot flood the parent UI.
- The window shows the last 8 lines, with older calls collapsed into a leading `… N more` counter;
  the writing tail reads `writing report… (1,214 chars)`, its digit grouping applied explicitly
  rather than taken from the host locale.
- Every result returned after the tracker exists carries `details: { role, trace, writingChars }`:
  the success return pairs it with the child's report text in `content`, the aborted and error
  returns pair it with `isError: true`.

### `core/trace.ts`

- New host-agnostic module holding the trace model and its formatting: `TraceEntry`,
  `TraceStatus`, `TRACE_ARG_MAX = 60`, `formatTraceArg`, `formatDuration`, `formatTraceLine`,
  `TRACE_MAX_VISIBLE_LINES = 8`, `formatWritingTail` and `renderTrace`. It imports nothing, so
  `core/` stays free of host packages.
- `pi/task-tool.ts` maps Pi session events onto that model through the exported, session-free
  `createTraceTracker`, which a test can drive with a stubbed event array, a fake clock and a
  recording `onUpdate`.

### Rendering

- `renderResult` on the `microspec_task` tool definition draws the windowed trace block above the
  report text, both in the interactive transcript and in the HTML export, and keeps it visible
  after completion. The `writing report… (N chars)` tail is drawn only while the call is still
  running (`options.isPartial`); the final transcript and HTML export omit it, though
  `details.writingChars` stays populated.
- It returns a structural component (`render(width)` / `invalidate()`), so
  `@earendil-works/pi-tui` is not imported into the adapter.
- JSON and print modes have no UI and do not draw the trace.

### Tests

- `tests/trace.test.ts` — 28 golden-string tests for the formatter: argument truncation at 60
  characters with a trailing ellipsis, `read`/`edit` as `path:lines`, sub-second and second-scale
  durations, the `running` / `ok` / `FAIL` lines, the `… N more` counter, the 8-line window and
  the writing tail.
- `tests/pi-task-trace.test.ts` — 20 tests for the tracker (immediate emit on start, closing an
  entry from the end event's own `durationMs`/`isError`, the 5-second text throttle, unrelated
  events, abort → `FAIL`), the `onUpdate` callback contract, the result `details` and
  `renderResult`.
- The suite grows from 121 to 169 tests.

### Docs

- README documents the trace under `#### microspec_task` in the Tools section.

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
