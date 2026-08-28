#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { searchSkills } = require("../skills/skill-router/scripts/search-skills.js");

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  let payload = {};
  try {
    payload = input.trim() ? JSON.parse(input) : {};
  } catch {
    emitContext("Skill routing hook could not parse its input. Fall back to the visible Skill names and descriptions; do not block the request.");
    return;
  }

  const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
  if (!prompt || isTrivialPrompt(prompt)) return;

  try {
    const result = searchSkills({ query: prompt, cwd: process.cwd(), limit: 5, minScore: 25 });
    emitContext(buildContext(result.candidates));
  } catch (error) {
    emitContext(`Skill routing search failed (${error.message}). Fall back to the visible Skill names and descriptions; do not block the request.`);
  }
});

function isTrivialPrompt(prompt) {
  const compact = prompt.replace(/[\s，。！？!?,.]+/g, "").toLowerCase();
  return compact.length <= 12 && /^(谢谢|好的|好|收到|明白|ok|okay|thanks|thankyou|继续|可以)$/.test(compact);
}

function buildContext(candidates) {
  const scriptPath = path.resolve(__dirname, "../skills/skill-router/scripts/search-skills.js");
  const lines = [
    "Skill routing preflight is active for this user request.",
    "Treat the candidates as discovery evidence, not proof. Before task actions, read the complete SKILL.md of every genuinely relevant candidate. Use multiple Skills only when independently necessary. Do not force weak matches.",
    "If a relevant Skill is selected, do not stop after announcing or describing the plan. Read it and continue executing the user's request in the same turn.",
    "Ask the user a follow-up question only when missing required information, authorization, or external access genuinely prevents safe progress.",
  ];

  if (candidates.length) {
    lines.push("Automatically retrieved candidates:");
    candidates.forEach((candidate, index) => {
      const description = candidate.description.replace(/\s+/g, " ").slice(0, 240);
      lines.push(`${index + 1}. ${candidate.name} | score=${candidate.score} | ${candidate.path} | ${description}`);
    });
  } else {
    lines.push("No reliable lexical candidate was found from the original wording.");
  }

  lines.push(
    `If cross-language wording, an abbreviation, or an omitted Skill may have hidden the right match, retry once with 3-8 concise intent aliases using: node ${JSON.stringify(scriptPath)} --query "<original request plus aliases>" --limit 5`,
    "If no candidate is relevant after that, continue normally using no Skill.",
  );
  return lines.join("\n");
}

function emitContext(additionalContext) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext,
    },
  }));
}
