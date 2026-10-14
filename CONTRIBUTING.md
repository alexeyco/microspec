# Contributing

## Branching

- Never push to `master`.
- Branch from `master`: `git checkout -b feat/<topic>`.
- Commit messages: no conventional prefixes (`feat:`, `fix:`, …), past tense —
  e.g. `Added microspec-brief skill`, `Fixed validateTask empty-result check`.

## Development

Install dependencies and run the checks — same as CI. Tests require Node ≥ 22.18
(default type stripping). `make check` runs `scripts/check.mjs`, typechecks the
plugin, and runs the test suite:

```sh
npm ci
make fmt
make check
```

Test locally without publishing (local installs are not copied, edits are live):

```sh
# sandbox opencode.jsonc
{ "plugins": ["/absolute/path/to/microspec"] }
```

Point OpenCode at the absolute path; edits take effect on the next session
or `/reload` — no copying, no reinstall.

- Run `make fmt` before committing.
- Keep `package.json` `files` and `pi` manifest in sync when adding paths. Assets are read at
  runtime relative to `import.meta.dirname`.
- Permission/tool scoping is intentionally absent from agent frontmatter — behavior is bounded
  by role prompt + injected `SUBAGENT_CONTRACT` + task Plan/Guardrails.

## Layout

```
microspec/
├── index.ts                     # shim: export { default } from "./opencode/index.ts"
├── package.json                 # opencode plugin (exports "." → ./opencode/index.ts) + pi manifest
├── core/                        # framework-agnostic logic (shared by both adapters)
│   ├── markdown.ts              # frontmatter parse/validate (uses `yaml` package)
│   ├── roles.ts                 # load agents/*.md into RoleAsset[]
│   ├── contract.ts              # TASK.md template, parse, validate, status vocabulary
│   ├── gitignore.ts             # ensureTaskIgnored + pure helpers
│   └── prompts.ts               # command instruction texts + SUBAGENT_CONTRACT
├── opencode/
│   └── index.ts                 # plugin entry: agents + skills + commands + contract injection + microspec_validate_task
├── pi/
│   ├── index.ts                 # extension entry: commands + microspec_task tool + microspec_validate_task
│   ├── task-tool.ts             # microspec_task: nested subagent runner via createAgentSession
│   └── validate-tool.ts         # microspec_validate_task: mechanical contract validation
├── agents/                      # 9 role definitions, shared markdown (single source of truth)
│   ├── microspec-researcher.md  # facts + quality bar (read-only)
│   ├── microspec-planner.md     # dependency-aware Plan skeleton, re-plans
│   ├── microspec-drafter.md     # full TASK.md draft
│   ├── microspec-critic.md      # contract check: CLEAN or NEEDS-FIX
│   ├── microspec-implementer.md # exactly one plan step
│   ├── microspec-verifier.md    # Given/When/Then by execution
│   ├── microspec-reviewer.md    # diff vs Goal, Guardrails, AC
│   ├── microspec-docwriter.md   # docs in sync with behavior
│   └── microspec-retrospector.md # run evidence → ranked findings
├── skills/
│   ├── microspec-brief/SKILL.md    # briefing flow
│   ├── microspec-execute/SKILL.md  # execution flow
│   ├── microspec-retro/SKILL.md    # retrospective flow
│   └── task-contract/SKILL.md      # canonical TASK.md contract spec
├── docs/
│   ├── agents.md                # role catalog + dispatch mechanics
│   ├── task-contract.md         # contract deep-dive + example
│   └── gallery/flow.svg         # hero diagram
├── scripts/check.mjs            # repo sanity checks behind `make check`
├── tests/                       # node --test, TypeScript files run via node type-stripping
├── Makefile  tsconfig.json  .gitignore
├── .github/                     # workflows/ci.yml, workflows/publish.yml, dependabot.yml,
│                                # ISSUE_TEMPLATE/improvement.md, PULL_REQUEST_TEMPLATE.md
├── README.md  AGENTS.md  CHANGELOG.md  CONTRIBUTING.md  LICENSE
```

## Testing

- Test runner: `node --test "tests/**/*.test.ts"` (TypeScript via Node type stripping).
- Tests live in `tests/` and mirror the `core/` module structure.
- No external test frameworks — use `node:test` and `node:assert`.

## Publishing

1. Add a `CHANGELOG.md` entry for the new version.
2. Bump `version` in `package.json` (semver) and refresh the committed
   `package-lock.json` with `npm install`.
3. Merge the PR to `master`.
4. Tag and push the tag:

   ```sh
   git tag vX.Y.Z && git push origin vX.Y.Z
   ```

5. The `publish` workflow runs `npm publish` with provenance on tag push.
