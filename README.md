# Skill Router

> **Stop your coding agent from ignoring the skills you installed.**
> A local, dependency-free [OpenAI Codex](https://developers.openai.com/codex) plugin that routes every user prompt to the most relevant installed Skills — before the agent starts working.

**Language / 语言**: [English](#why) · [简体中文](README.zh-CN.md)

---

## Why

Agent Skills (the open `SKILL.md` standard) are a great way to package reusable workflows — but Codex only loads each skill's *metadata* (name + description) at startup, and implicit activation depends on the model noticing a match. In practice this fails in two predictable ways:

1. **The agent never uses an installed skill** that clearly applies to the task.
2. **The agent announces a skill or a plan, then stops** without actually executing it.

Skill Router closes that gap with a `UserPromptSubmit` hook: before every substantive prompt, it searches all installed Skill metadata locally, injects the strongest candidates into context, and — crucially — injects the *adoption discipline* that makes the agent actually read the selected `SKILL.md` and continue executing in the same turn.

## How it works

```text
user prompt ──▶ UserPromptSubmit hook (local Node.js, <1s)
                 │  1. scan SKILL.md frontmatter across all skill roots
                 │  2. rank: IDF-weighted lexical match + name-phrase boost
                 │     + Levenshtein fuzzy (≥0.8) + negative-context penalty
                 │     + query-coverage bonus → top 5 above a score floor
                 ▼
              additionalContext injected into the turn:
              - candidate list (name | score | path | description)
              - adoption contract: read the full SKILL.md before acting,
                keep executing in the same turn, never force weak matches
              - one retry path with 3–8 cross-language aliases if zero hits
```

A bundled `skill-router` Skill exposes the same search as a CLI for manual or cross-language retries:

```bash
node <plugin-root>/skills/skill-router/scripts/search-skills.js --query "..." --limit 5
```

## Features

- **Zero dependencies** — pure Node.js standard library, no `npm install`.
- **Fully local & private** — no network requests, no telemetry; only `SKILL.md` frontmatter (`name` / `description`) is ever read.
- **Fails open** — a routing error injects a fallback hint and never blocks the user's request.
- **Same-turn execution contract** — the injected context forbids "announce a skill, then stop".
- **Negative-context aware ranking** — descriptions containing `not for / 不适用于` phrases are penalized instead of matched.
- **Monorepo friendly** — every `.agents/skills` directory from the working directory up to the git root is scanned, plus user, `$CODEX_HOME`, plugin-cache and system roots.
- **Large-repo safe** — symlink-loop protection, a 5000-file scan cap, and skip-lists for build output (`Binaries`, `Intermediate`, `Saved`, `DerivedDataCache`, `node_modules`, `target`, …).
- **Cross-language** — CJK n-gram tokenization plus an explicit Chinese/English alias retry path.
- **Duplicate-install detection** — warns about legacy manual installs and stale global `AGENTS.md` routing rules that would route every prompt twice.

## Requirements

- [OpenAI Codex CLI](https://developers.openai.com/codex) (plugin + hooks support)
- Node.js 18+ (any recent LTS)
- Windows, macOS, or Linux

## Installation

From the distribution root (the directory containing this file):

```bash
codex plugin marketplace add "<distribution-root>"
codex plugin add skill-router@skill-router-community
codex plugin list --marketplace skill-router-community --available --json
```

Then:

1. Open `/hooks` in Codex and **trust** the Skill Router `UserPromptSubmit` hook (required, one time — and again after any plugin update).
2. Start a **new task** and verify routing with a prompt tied to an installed test Skill.

> AI-assisted install: point your agent at `INSTALL_WITH_AI.md` — it redirects to `AGENT_RUNBOOK.md`, the canonical installation / verification / maintenance / troubleshooting contract.

## Scanned skill roots

| Root | Scope |
|------|-------|
| `<cwd>/…/.agents/skills` (up to git root) | repository / monorepo levels |
| `~/.agents/skills` | user-global |
| `$CODEX_HOME/skills` (default `~/.codex/skills`) | Codex user skills |
| `$CODEX_HOME/plugins/cache` | installed plugin skills |
| `/etc/codex/skills` (non-Windows) | system / admin level |

## Privacy

- **No network access. No telemetry.** The hook and search script are pure local file scans.
- Only skill *metadata* is parsed; full `SKILL.md` bodies are loaded solely by Codex when a skill is genuinely selected.
- Nothing about your prompts or skills ever leaves the machine.

## Documentation

| File | Audience |
|------|----------|
| [`README.md`](README.md) | humans — overview & quick start (English) |
| [`README.zh-CN.md`](README.zh-CN.md) | 人类读者——中文概览与快速上手 |
| [`AGENT_RUNBOOK.md`](AGENT_RUNBOOK.md) | Codex agents — canonical install / verify / maintain / troubleshoot contract |
| [`INSTALL_WITH_AI.md`](INSTALL_WITH_AI.md) | agent entry redirect |

## Contributing

Issues and PRs welcome. When changing plugin behavior, follow the maintenance protocol in `AGENT_RUNBOOK.md` (syntax check → plugin validation → manifest cachebuster → reinstall → behavioral verification in a new task).

## License

[MIT](LICENSE) © Skill Router Contributors
