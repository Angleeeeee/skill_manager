# Changelog

All notable changes to **Skill Router** are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the base version (`X.Y.Z`) follows [Semantic Versioning](https://semver.org/), and the `+codex.<UTC timestamp>` suffix carried by `plugins/skill-router/.codex-plugin/plugin.json` is only a Codex install-cache buster — it is not part of the version.

语言说明：更新日志以英文维护，中文概览见 [`README.zh-CN.md`](README.zh-CN.md)。

## [0.2.0] - 2026-08-29

### Added

- **Routing log.** Every hook and CLI decision is appended as one JSON object per line to `$CODEX_HOME/skill-router/routing.jsonl`, turning previously silent failures into observable data. Events: `routed` (with `candidateCount`, `zeroCandidates`, `candidates[]`, `durationMs`, `indexedSkills`, `roots`), `skip` (`reason`, `query`), `search_error` (`error`, `durationMs`), `input_parse_error`, and `search` for manual CLI runs.
- `logRouting()` and `truncateForLog()` exported from `search-skills.js`, so the hook and the CLI share one writer instead of duplicating it.
- `SKILL_ROUTER_LOG` environment variable: set a path to relocate the log, or `off` / `0` / `false` / `none` / empty to disable logging entirely.
- **Repository layout** section in both READMEs documenting every shipped file and its responsibility, plus the rule that new ranking logic belongs in `search-skills.js` rather than the hook.

### Changed

- Log writes are best-effort and fully wrapped: a failing, unwritable, or missing log target can never break routing or add latency to the hook path.
- Queries are truncated to 160 characters before being logged, and `Privacy` in both READMEs now states explicitly that the log is local-only, snippet-sized, and disableable.
- Installation docs no longer assume a unzipped distribution package: the repository root *is* the distribution root, so the documented path is `git clone` → `codex plugin marketplace add "$(pwd)"`.
- Base plugin version raised `0.1.0` → `0.2.0` with a fresh `+codex.20260829045915` cachebuster, per the maintenance protocol in `AGENT_RUNBOOK.md`.

### Fixed

- **Cloning the repo and following its own install instructions failed.** `.agents/plugins/marketplace.json`, `plugins/skill-router/.codex-plugin/plugin.json`, and `.gitignore` were present in the distribution ZIP but missing from the repository, so `codex plugin marketplace add <repo-root>` had no marketplace manifest to read — exactly the files `AGENT_RUNBOOK.md` lists as required. All three are now tracked.

### Removed

- `skill-router-distribution-0.1.0.zip` is no longer tracked. A committed snapshot of the sources goes stale on the next version bump and is already covered by `.gitignore`'s `*.zip`; distribution ZIPs belong in GitHub Releases.

## [0.1.0] - 2026-08-28

### Added

- Initial plugin: a `UserPromptSubmit` hook that scans `SKILL.md` frontmatter across repository, user, `$CODEX_HOME`, plugin-cache and system skill roots, ranks candidates with IDF-weighted lexical matching, name-phrase bonuses, Levenshtein fuzzy matching (≥0.8), negative-context penalties and query-coverage scoring, and injects the top five above a score floor.
- Adoption contract in the injected context: read the selected `SKILL.md` in full before acting, keep executing in the same turn, never force a weak match, and ask a follow-up only when genuinely blocked.
- Bundled `skill-router` Skill exposing the same search as a zero-dependency CLI (`--query`, `--limit`, `--root`, `--json`, `--min-score`, `--include-router`) for manual and cross-language retries.
- CJK n-gram tokenization, symlink-loop protection, a 5000-file scan cap, build-output skip-lists, and case-insensitive realpath deduplication across skill roots.
- Fail-open behavior: parse or search failures inject a fallback hint instead of blocking the user's request.
- Duplicate-install detection for legacy manual installs and stale global `AGENTS.md` routing rules.
- Docs: English + Chinese READMEs, `AGENT_RUNBOOK.md` as the canonical agent contract, and `INSTALL_WITH_AI.md` as the agent entry redirect.
