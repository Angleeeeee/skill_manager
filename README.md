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
                 │
                 └─▶ every decision also appended to routing.jsonl (local)
```

A bundled `skill-router` Skill exposes the same search as a CLI for manual or cross-language retries:

```bash
node <plugin-root>/skills/skill-router/scripts/search-skills.js --query "..." --limit 5
```

## Features

- **Zero dependencies** — pure Node.js standard library, no `npm install`.
- **Fully local & private** — no network requests, no telemetry; only `SKILL.md` frontmatter (`name` / `description`) is ever read.
- **Fails open** — a routing error injects a fallback hint and never blocks the user's request.
- **Routing log** — every decision (`routed` / `skip` / `zero candidates` / `search_error`) is appended to a local JSONL file, so silent routing misses and swallowed errors become visible.
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

The repository root **is** the distribution root — `.agents/plugins/marketplace.json` and `plugins/skill-router/` sit directly inside it. Clone it (or unzip a [release](https://github.com/Angleeeeee/skill_manager/releases)) and point Codex at that directory:

```bash
git clone https://github.com/Angleeeeee/skill_manager.git
cd skill_manager

codex plugin marketplace add "$(pwd)"          # Windows PowerShell: codex plugin marketplace add (Get-Location)
codex plugin add skill-router@skill-router-community
codex plugin list --marketplace skill-router-community --available --json
```

If you keep your own copy of the sources elsewhere, run `codex plugin marketplace add "<distribution-root>"` against that directory instead — `<distribution-root>` is any directory containing `.agents/plugins/marketplace.json`.

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

## Routing log

Routing used to fail silently: a zero-candidate search, a swallowed exception, or a skipped prompt left no trace, so "why didn't my skill fire?" was unanswerable. Every hook and CLI decision is now appended to a local JSONL file.

- **Default path**: `$CODEX_HOME/skill-router/routing.jsonl` (falls back to `~/.codex/skill-router/routing.jsonl`).
- **Redirect**: `SKILL_ROUTER_LOG=/path/to/routing.jsonl`
- **Disable**: `SKILL_ROUTER_LOG=off` (also accepts `0`, `false`, `none`, or an empty value)

| Event | Emitted when | Notable fields |
|-------|--------------|----------------|
| `routed` | the hook completed a search | `candidateCount`, `zeroCandidates`, `candidates[]`, `durationMs`, `indexedSkills`, `roots` |
| `skip` | the prompt was empty or trivial (`thanks`, `ok`, …) | `reason`, `query` |
| `search_error` | the search threw | `error`, `durationMs` |
| `input_parse_error` | the hook payload was not valid JSON | — |
| `search` | the CLI ran a manual search | `source: "cli"`, same fields as `routed` |

Queries are truncated to 160 characters, and the log is written locally — nothing is uploaded. Logging failures are swallowed by design; they can never break routing.

```bash
# the three questions you actually ask
tail -n 20 "$CODEX_HOME/skill-router/routing.jsonl"
grep -c '"zeroCandidates":true' "$CODEX_HOME/skill-router/routing.jsonl"
grep '"event":"search_error"' "$CODEX_HOME/skill-router/routing.jsonl"
```

A high `zeroCandidates` ratio on Chinese prompts against English-named skills is the known recall limit of lexical matching — that is the signal to add cross-language aliases to the skill's `description`.

## Repository layout

```text
.
├── .agents/plugins/marketplace.json        # Codex marketplace manifest: name, plugin source, install policy
├── .gitignore
├── AGENT_RUNBOOK.md                        # canonical install / verify / maintain / troubleshoot contract (agents)
├── CHANGELOG.md                            # release history, newest first
├── INSTALL_WITH_AI.md                      # one-line agent entry redirect → AGENT_RUNBOOK.md
├── LICENSE                                 # MIT
├── README.md                               # this file — human overview (English)
├── README.zh-CN.md                         # 人类概览（简体中文）
└── plugins/skill-router/                   # the plugin package (marketplace `source` target)
    ├── .codex-plugin/plugin.json           # plugin manifest: name, version + cachebuster, display metadata
    ├── hooks/hooks.json                    # registers the UserPromptSubmit hook, timeout, context limit
    ├── hooks/user-prompt-submit.js         # hook entry: reads the prompt JSON, searches, injects context, logs
    └── skills/skill-router/
        ├── SKILL.md                        # the bundled routing skill: search discipline and output contract
        ├── agents/openai.yaml              # agent-facing metadata for the skill
        └── scripts/search-skills.js        # zero-dependency indexer + ranker; also a CLI; owns the routing log
```

`search-skills.js` holds all retrieval logic (tokenizer, IDF weights, fuzzy match, negative-context penalty, root discovery, log writer). `user-prompt-submit.js` is a thin adapter: stdin payload in, `additionalContext` out. Keep new ranking logic in the script so the hook and the CLI stay equivalent.

## Privacy

- **No network access. No telemetry.** The hook and search script are pure local file scans.
- Only skill *metadata* is parsed; full `SKILL.md` bodies are loaded solely by Codex when a skill is genuinely selected.
- The routing log is written to your own machine only, stores at most a 160-character query snippet, and is fully disableable with `SKILL_ROUTER_LOG=off`.
- Nothing about your prompts or skills ever leaves the machine.

## Documentation

| File | Audience |
|------|----------|
| [`README.md`](README.md) | humans — overview & quick start (English) |
| [`README.zh-CN.md`](README.zh-CN.md) | 人类读者——中文概览与快速上手 |
| [`AGENT_RUNBOOK.md`](AGENT_RUNBOOK.md) | Codex agents — canonical install / verify / maintain / troubleshoot contract |
| [`CHANGELOG.md`](CHANGELOG.md) | humans & agents — release history, newest first |
| [`INSTALL_WITH_AI.md`](INSTALL_WITH_AI.md) | agent entry redirect |

## Contributing

Issues and PRs welcome. When changing plugin behavior, follow the maintenance protocol in `AGENT_RUNBOOK.md` (syntax check → plugin validation → manifest cachebuster → reinstall → behavioral verification in a new task).

Every user-visible change also needs a `CHANGELOG.md` entry, and a base-version bump (`0.2.0` → `0.3.0`) when behavior changes — the `+codex.<UTC timestamp>` suffix only busts the Codex install cache and never substitutes for the version itself.

## License

[MIT](LICENSE) © Skill Router Contributors
