# Skill Router — Agent Runbook

Audience: Codex agents. Treat this file as the canonical installation, verification, maintenance, and troubleshooting contract for this distribution.

## Objective

Install and maintain `skill-router@skill-router-community`. The plugin runs a local `UserPromptSubmit` Hook before substantive prompts, searches installed Skill metadata, and injects up to five plausible candidates for semantic selection by Codex.

## Resolve paths

- Set `<distribution-root>` to the absolute directory containing this `AGENT_RUNBOOK.md`.
- Set `<plugin-root>` to `<distribution-root>/plugins/skill-router`.
- Never assume a drive letter, username, operating system, or Python location.
- Quote every filesystem path passed to a shell command.

Required distribution files:

```text
<distribution-root>/.agents/plugins/marketplace.json
<plugin-root>/.codex-plugin/plugin.json
<plugin-root>/hooks/hooks.json
<plugin-root>/hooks/user-prompt-submit.js
<plugin-root>/skills/skill-router/SKILL.md
<plugin-root>/skills/skill-router/scripts/search-skills.js
```

## Installation protocol

1. Verify that the required distribution files exist.
2. Verify runtime dependencies without installing system software automatically:

   ```text
   codex --version
   node --version
   ```

3. If either dependency is unavailable, stop and report the missing dependency. Obtain user approval before installing or changing system software.
4. Inspect current state:

   ```text
   codex plugin marketplace list
   codex plugin list --available --json
   ```

5. If `skill-router-community` is not configured, add this non-default local marketplace:

   ```text
   codex plugin marketplace add "<distribution-root>"
   ```

6. Install or reinstall the plugin:

   ```text
   codex plugin add skill-router@skill-router-community
   ```

7. Verify that `skill-router@skill-router-community` reports `installed: true` and `enabled: true`:

   ```text
   codex plugin list --marketplace skill-router-community --available --json
   ```

8. Tell the user to open `/hooks`, review and trust the Skill Router `UserPromptSubmit` Hook, and then start a new task. Do not claim that Hook trust is complete unless it is observable.
9. In the new task, verify routing with a prompt tied to an installed test Skill, for example:

   ```text
   测试 skill
   ```

   If `demo-hello` is installed, successful adoption should produce its unique required behavior, not merely mention its name.

## Runtime contract

For each non-trivial prompt, the Hook must:

1. Scan `SKILL.md` frontmatter from repository `.agents/skills`, user `.agents/skills`, `$CODEX_HOME/skills`, installed plugin caches, and `/etc/codex/skills` where applicable.
2. Parse only valid entries with non-placeholder `name` and `description` fields.
3. Rank candidates using local lexical and fuzzy matching, negative-context penalties, and name deduplication.
4. Return at most five candidates. Ranking is discovery evidence, not proof of applicability.
5. Require Codex to read each genuinely selected Skill's complete `SKILL.md` before task actions.
6. Require Codex to continue executing the request in the same turn after selecting a Skill. It must not stop after announcing a Skill or describing a plan.
7. Permit a follow-up question only when missing required information, authorization, or external access genuinely blocks safe progress.
8. Continue normally without a Skill when no candidate is genuinely relevant.

The plugin must not execute matched Skills, make network requests, or send prompt or Skill metadata to an external service.

## Duplicate-installation handling

Check for both of these legacy components:

- a manually installed personal `skill-router` directory;
- a global `AGENTS.md` section named `Skill Routing Preflight` that calls an old routing script.

Warn that keeping either component may route every prompt twice. Do not delete or rewrite legacy configuration without explicit user authorization. When authorized, resolve and verify the exact targets first, prefer a recoverable deletion method, and confirm the plugin remains installed and enabled afterward.

## Maintenance protocol

Treat `<distribution-root>` as the source of truth. Never edit only the installed cache.

After changing plugin behavior:

1. Edit source files under `<plugin-root>`.
2. Validate JavaScript syntax with `node --check` for every changed JavaScript file.
3. Validate the plugin using the available `plugin-creator` validator.
4. Apply a single Codex cachebuster to the plugin manifest using the available `plugin-creator` update helper. Preserve the base version and replace any existing cachebuster.
5. Reinstall with:

   ```text
   codex plugin add skill-router@skill-router-community
   ```

6. Verify the installed version and inspect the installed Hook file when behavior changed.
7. Rebuild the distribution ZIP and report its new SHA-256.
8. Start a new task for behavioral verification. Re-review `/hooks` if Codex reports that the Hook changed.

Keep `README.md` (human-facing), `AGENT_RUNBOOK.md`, agent installation instructions, plugin source, manifest version, installed cache, distribution ZIP, and reported checksum synchronized.

## Troubleshooting

### Routing script path does not exist

Determine whether the failing path references a deleted manual installation or the current plugin cache. Old tasks retain earlier global instructions in their context. If the old manual path and old global rule have already been removed while the plugin path exists, start a new task; restart Codex only if a new task still uses the stale path.

### Agent announces a Skill and stops

Confirm that the installed Hook context includes the same-turn execution requirement from the Runtime contract. If source contains it but the installed cache does not, update the cachebuster and reinstall. Test from a new task.

### Hook completed but wrong Skill was used

Separate candidate retrieval from final adoption:

- verify whether the expected Skill appeared in the top five;
- verify that Codex read the selected `SKILL.md`;
- verify behavior unique to that Skill;
- treat a self-reported Skill name without matching behavior as unproven.

### No candidate found

Retry at most once with 3–8 concise aliases covering the domain, action, and output type. Do not lower the score threshold or force a weak match by default.

## Completion report

After installation or maintenance, report only verifiable facts:

- marketplace configured or already present;
- plugin version, installed state, enabled state, and source path;
- syntax and plugin validation results;
- Hook trust status, or that user action is still required;
- duplicate manual installation status;
- ZIP path and SHA-256 when the distribution changed;
- requirement to use a new task for final behavioral verification.
