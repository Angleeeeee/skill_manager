---
name: skill-router
description: Search installed Codex skills and rank the most relevant candidates for a user request. Use when deciding which skill should handle a task, when many installed skills may hide a relevant match, when implicit skill activation may have failed, or when the user asks which skill applies. This skill only routes; read each selected skill's own SKILL.md before using it.
---

# Skill Router

Use the bundled local search script to retrieve a small candidate set, then make the final semantic selection.

## Route a request

1. Preserve the user's original wording.
2. Add 3-8 concise Chinese or English intent aliases only when they improve cross-language recall. Include the domain, requested action, and output type. Do not add unrelated guesses.
3. Run:

   ```text
   node scripts/search-skills.js --query "<original request plus concise aliases>" --limit 5
   ```

   Resolve `scripts/search-skills.js` relative to this Skill directory. The plugin's prompt hook normally performs the first search automatically, so run this manually only for a cross-language retry or an explicit broad discovery request.
4. Inspect at most the returned five candidates. A ranking result is evidence for discovery, not proof that the Skill applies.
5. Read the complete `SKILL.md` for each genuinely relevant candidate before taking task actions. Select multiple Skills only when they cover independently necessary parts of the request.
6. If no candidate is relevant, continue normally. Do not force a weak keyword match.

## Search discipline

- Run the search once by default. Retry at most once when zero useful candidates clearly resulted from a missing synonym or abbreviation.
- The default score floor intentionally suppresses weak one-word overlaps. Retry with better aliases rather than lowering it unless the user explicitly wants a broad discovery search.
- Keep the original request in the query; aliases supplement it rather than replace it.
- Prefer action and artifact terms such as `创建 create`, `审批 approval`, `测试用例 testcase`, `崩溃 crash`, or `表格 spreadsheet` over conversational filler.
- Do not read every installed Skill body. The script searches only metadata, and full instructions are loaded only for selected candidates.
- Do not route recursively to `skill-router`; the script excludes itself by default.
- If the script fails, fall back to the Skill names and descriptions already visible in the current context. Do not block an otherwise answerable request.

## Output contract

The script prints the number of indexed Skills followed by ranked candidates. Each candidate contains:

- Skill name
- Relevance score
- Matched terms and fields
- Short description
- Absolute `SKILL.md` path

Use `--json` only when structured output is useful. Use repeated `--root <path>` arguments to add nonstandard Skill roots.
