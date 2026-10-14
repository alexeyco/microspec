# @alexeyco/microspec

Repo guide for AI agents working on this repository.
Human-facing docs: [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md).

## Conventions

- All content in English.
- Two hosts only — OpenCode v2 and Pi. No v1 plugin API references.
- No model pins anywhere — roles inherit the session model.
- `agents/*.md` is the single source of truth consumed by both adapters. Frontmatter carries
  `description`, `mode: subagent`, and `color` only. The same file drives both hosts.
- `core/` has no host imports — only Node builtins and `yaml`. Both adapters import from `core/`;
  `core/` never imports from `opencode/` or `pi/`.

Release: tag-driven npm publish — see [CONTRIBUTING.md](CONTRIBUTING.md#publishing).
