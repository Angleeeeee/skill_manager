#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SKIP_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  "Binaries",
  "DerivedDataCache",
  "Intermediate",
  "Saved",
  "build",
  "dist",
  "node_modules",
  "out",
  "target",
]);

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "for",
  "from", "help", "how", "i", "in", "is", "it", "me", "my", "of", "on",
  "or", "please", "the", "this", "to", "use", "user", "want", "with",
  "一下", "一个", "什么", "可以", "如何", "帮我", "我的", "是否", "这个", "需要",
  "用户", "进行", "相关", "处理", "使用", "支持", "任务", "请求", "问题",
]);

const NEGATIVE_MARKERS = /(?:不用于|不适用于|不要用于|不负责|不能用于|并非用于|not\s+for|do\s+not\s+use|does\s+not\s+handle|doesn't\s+handle)/i;

function normalize(text) {
  return String(text ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(text) {
  const normalized = normalize(text);
  const tokens = new Set();
  for (const match of normalized.match(/[a-z0-9]+(?:[-_.:/][a-z0-9]+)*/g) ?? []) {
    tokens.add(match);
    for (const part of match.split(/[-_.:/]+/)) {
      if (part.length > 1) tokens.add(part);
    }
  }
  for (const chunk of normalized.match(/[\u3400-\u4dbf\u4e00-\u9fff]+/g) ?? []) {
    if (chunk.length > 1 && chunk.length <= 12) tokens.add(chunk);
    for (const size of [2, 3]) {
      for (let index = 0; index + size <= chunk.length; index += 1) {
        tokens.add(chunk.slice(index, index + size));
      }
    }
  }
  return new Set([...tokens].filter((token) => token.length > 1 && !STOPWORDS.has(token)));
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith('"')) {
    try {
      return String(JSON.parse(trimmed));
    } catch {
      return trimmed.replace(/^"|"$/g, "");
    }
  }
  if (trimmed.startsWith("'")) return trimmed.replace(/^'|'$/g, "").replace(/''/g, "'");
  return trimmed;
}

function parseSkill(skillPath) {
  let text;
  try {
    text = fs.readFileSync(skillPath, "utf8").replace(/^\uFEFF/, "");
  } catch {
    return null;
  }
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;
  let end = -1;
  for (let index = 1; index < Math.min(lines.length, 200); index += 1) {
    if (lines[index].trim() === "---") {
      end = index;
      break;
    }
  }
  if (end < 0) return null;

  const fields = {};
  for (let index = 1; index < end; index += 1) {
    const match = lines[index].match(/^(name|description):\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (["|", ">", "|-", ">-", "|+", ">+"].includes(rawValue.trim())) {
      const parts = [];
      index += 1;
      while (index < end && (!lines[index].trim() || /^\s/.test(lines[index]))) {
        if (lines[index].trim()) parts.push(lines[index].trim());
        index += 1;
      }
      index -= 1;
      fields[key] = parts.join(" ");
    } else {
      fields[key] = parseScalar(rawValue);
    }
  }

  if (!fields.name || !fields.description || fields.description.includes("TODO")) return null;
  return {
    name: fields.name.trim(),
    description: fields.description.trim(),
    path: fs.realpathSync(skillPath),
  };
}

function splitDescription(text) {
  const positive = [];
  const negative = [];
  for (const sentence of String(text).split(/(?<=[。！？.!?;；])\s*/)) {
    (NEGATIVE_MARKERS.test(sentence) ? negative : positive).push(sentence);
  }
  return [positive.join(" "), negative.join(" ")];
}

function findGitRoot(cwd) {
  let cursor = path.resolve(cwd);
  while (true) {
    if (fs.existsSync(path.join(cursor, ".git"))) return cursor;
    const parent = path.dirname(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
}

function repositorySkillRoots(cwd) {
  const current = path.resolve(cwd);
  const gitRoot = findGitRoot(current);
  if (!gitRoot) return [path.join(current, ".agents", "skills")];
  const roots = [];
  let cursor = current;
  while (true) {
    roots.push(path.join(cursor, ".agents", "skills"));
    if (cursor === gitRoot) break;
    cursor = path.dirname(cursor);
  }
  return roots;
}

function defaultRoots(cwd) {
  const home = os.homedir();
  const codexHome = process.env.CODEX_HOME || path.join(home, ".codex");
  const roots = [
    ...repositorySkillRoots(cwd),
    path.join(home, ".agents", "skills"),
    path.join(codexHome, "skills"),
    path.join(codexHome, "plugins", "cache"),
  ];
  if (process.platform !== "win32") roots.push("/etc/codex/skills");
  return roots;
}

function uniqueExistingRoots(roots) {
  const result = [];
  const seen = new Set();
  for (const root of roots) {
    try {
      const resolved = fs.realpathSync(path.resolve(root));
      const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
      if (!seen.has(key) && fs.statSync(resolved).isDirectory()) {
        seen.add(key);
        result.push(resolved);
      }
    } catch {
      // Missing optional roots are normal.
    }
  }
  return result;
}

function collectSkillFiles(root, state) {
  const stack = [root];
  const visitedDirectories = new Set();
  while (stack.length) {
    const current = stack.pop();
    let realCurrent;
    try {
      realCurrent = fs.realpathSync(current);
    } catch {
      continue;
    }
    const directoryKey = process.platform === "win32" ? realCurrent.toLowerCase() : realCurrent;
    if (visitedDirectories.has(directoryKey)) continue;
    visitedDirectories.add(directoryKey);

    let entries;
    try {
      entries = fs.readdirSync(realCurrent, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(realCurrent, entry.name);
      if (entry.isFile() && entry.name === "SKILL.md") {
        state.inspected += 1;
        if (state.inspected > state.maxFiles) {
          throw new Error(`Skill scan exceeded the safety limit of ${state.maxFiles} SKILL.md files.`);
        }
        state.files.push(entryPath);
      } else if (!SKIP_DIRS.has(entry.name) && (entry.isDirectory() || entry.isSymbolicLink())) {
        stack.push(entryPath);
      }
    }
  }
}

function loadSkills(roots, maxFiles) {
  const state = { files: [], inspected: 0, maxFiles };
  for (const root of roots) collectSkillFiles(root, state);
  const seenPaths = new Set();
  const seenNames = new Set();
  const skills = [];
  for (const skillPath of state.files) {
    const pathKey = process.platform === "win32" ? skillPath.toLowerCase() : skillPath;
    if (seenPaths.has(pathKey)) continue;
    seenPaths.add(pathKey);
    const skill = parseSkill(skillPath);
    if (!skill) continue;
    const nameKey = normalize(skill.name);
    if (seenNames.has(nameKey)) continue;
    seenNames.add(nameKey);
    skills.push(skill);
  }
  return skills;
}

function levenshteinSimilarity(left, right) {
  if (left === right) return 1;
  if (!left.length || !right.length) return 0;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + cost,
      );
    }
    previous = current;
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

function rankSkills(query, skills, includeRouter = false) {
  const queryNormalized = normalize(query);
  const queryTokens = tokenize(query);
  if (!queryTokens.size) return [];

  const tokenData = [];
  const documentFrequency = new Map();
  for (const skill of skills) {
    const nameTokens = tokenize(skill.name);
    const [positiveDescription, negativeDescription] = splitDescription(skill.description);
    const descriptionTokens = tokenize(positiveDescription);
    const negativeTokens = tokenize(negativeDescription);
    const pathTokens = tokenize(path.basename(path.dirname(skill.path)));
    tokenData.push({ nameTokens, descriptionTokens, negativeTokens, pathTokens });
    for (const token of new Set([...nameTokens, ...descriptionTokens, ...pathTokens])) {
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    }
  }

  const count = Math.max(skills.length, 1);
  const weightFor = (token) => Math.log((count + 1) / ((documentFrequency.get(token) || 0) + 1)) + 1;
  const totalQueryWeight = [...queryTokens].reduce((sum, token) => sum + weightFor(token), 0) || 1;
  const ranked = [];

  skills.forEach((skill, index) => {
    if (!includeRouter && normalize(skill.name) === "skill-router") return;
    const { nameTokens, descriptionTokens, negativeTokens, pathTokens } = tokenData[index];
    let score = 0;
    let matchedWeight = 0;
    const reasons = [];
    const namePhrase = normalize(skill.name.replace(/[-_.:/]+/g, " "));
    const nameParts = new Set(namePhrase.split(" ").filter(Boolean));
    const negativeOverlap = [...queryTokens].filter((token) => negativeTokens.has(token));
    const applyNegativePenalty = negativeOverlap.length >= 2;

    if (namePhrase && queryNormalized.includes(namePhrase)) {
      score += 30;
      reasons.push([30, `名称短语:${namePhrase}`]);
    } else if (nameParts.size && [...nameParts].every((part) => queryTokens.has(part))) {
      score += 16;
      reasons.push([16, "名称全部命中"]);
    }

    for (const token of queryTokens) {
      const weight = weightFor(token);
      let contribution = 0;
      let field = "";
      if (nameTokens.has(token)) {
        contribution = 6 * weight;
        field = "名称";
      } else if (token.length >= 4 && nameTokens.size) {
        const ratio = Math.max(...[...nameTokens].map((candidate) => levenshteinSimilarity(token, candidate)));
        if (ratio >= 0.8) {
          contribution = 10 * ratio * weight;
          field = "名称模糊";
        }
      }
      if (!contribution && descriptionTokens.has(token)) {
        contribution = 2.4 * weight;
        field = "描述";
      } else if (!contribution && applyNegativePenalty && negativeTokens.has(token)) {
        contribution = -8 * weight;
        field = "排除";
      } else if (!contribution && pathTokens.has(token)) {
        contribution = weight;
        field = "路径";
      }
      if (contribution) {
        score += contribution;
        if (contribution > 0) matchedWeight += weight;
        reasons.push([contribution, `${field}:${token}`]);
      }
    }

    const coverage = Math.min(matchedWeight / totalQueryWeight, 1);
    score += 8 * coverage;
    if (score > 0.75) {
      ranked.push({
        name: skill.name,
        score: Number(score.toFixed(2)),
        coverage: Number(coverage.toFixed(3)),
        matches: reasons.sort((a, b) => b[0] - a[0]).slice(0, 6).map((item) => item[1]),
        description: skill.description,
        path: skill.path,
      });
    }
  });

  return ranked.sort((left, right) => right.score - left.score || right.coverage - left.coverage || left.name.localeCompare(right.name));
}

function searchSkills(options) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const roots = uniqueExistingRoots([...defaultRoots(cwd), ...(options.roots || [])]);
  const skills = loadSkills(roots, options.maxFiles || 5000);
  const minScore = options.minScore ?? 25;
  const candidates = rankSkills(options.query || "", skills, Boolean(options.includeRouter))
    .filter((candidate) => candidate.score >= minScore)
    .slice(0, options.limit || 5);
  return { indexedSkills: skills.length, roots, candidates };
}

function compactDescription(text, limit = 220) {
  const compact = String(text).replace(/\s+/g, " ").trim();
  return compact.length <= limit ? compact : `${compact.slice(0, limit - 1).trim()}…`;
}

function parseArguments(argv) {
  const options = { roots: [], limit: 5, maxFiles: 5000, minScore: 25, cwd: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === "--query") options.query = value, index += 1;
    else if (argument === "--limit") options.limit = Number(value), index += 1;
    else if (argument === "--root") options.roots.push(value), index += 1;
    else if (argument === "--cwd") options.cwd = value, index += 1;
    else if (argument === "--max-files") options.maxFiles = Number(value), index += 1;
    else if (argument === "--min-score") options.minScore = Number(value), index += 1;
    else if (argument === "--json") options.json = true;
    else if (argument === "--include-router") options.includeRouter = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function printHelp() {
  console.log("Usage: node search-skills.js --query <text> [--limit 1..10] [--json] [--root <path>]");
}

function runCli() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) return printHelp();
    if (!options.query) throw new Error("--query is required");
    if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 10) throw new Error("--limit must be between 1 and 10");
    const result = searchSkills(options);
    logRouting({
      event: "search",
      source: "cli",
      query: truncateForLog(options.query),
      indexedSkills: result.indexedSkills,
      roots: result.roots.length,
      minScore: options.minScore,
      candidateCount: result.candidates.length,
      zeroCandidates: result.candidates.length === 0,
      candidates: result.candidates.map((candidate) => ({ name: candidate.name, score: candidate.score, coverage: candidate.coverage })),
    });
    if (options.json) {
      console.log(JSON.stringify({ indexed_skills: result.indexedSkills, roots: result.roots, candidates: result.candidates }, null, 2));
      return;
    }
    console.log(`Indexed ${result.indexedSkills} skills from ${result.roots.length} roots.`);
    if (!result.candidates.length) {
      console.log("No plausible skill candidates found. Continue normally and do not force a match.");
      return;
    }
    result.candidates.forEach((candidate, index) => {
      console.log(`${index + 1}. ${candidate.name} | score=${candidate.score} | coverage=${candidate.coverage}`);
      console.log(`   matches: ${candidate.matches.join(", ")}`);
      console.log(`   description: ${compactDescription(candidate.description)}`);
      console.log(`   path: ${candidate.path}`);
    });
  } catch (error) {
    console.error(`Skill search failed: ${error.message}`);
    process.exitCode = 2;
  }
}

const QUERY_LOG_LIMIT = 160;

function truncateForLog(text) {
  const compact = String(text ?? "").replace(/\s+/g, " ").trim();
  return compact.length <= QUERY_LOG_LIMIT ? compact : `${compact.slice(0, QUERY_LOG_LIMIT - 1)}…`;
}

function resolveLogPath() {
  const envValue = process.env.SKILL_ROUTER_LOG;
  if (envValue !== undefined) {
    const trimmed = envValue.trim();
    const lowered = trimmed.toLowerCase();
    if (!trimmed || lowered === "off" || lowered === "0" || lowered === "false" || lowered === "none") return null;
    return path.resolve(trimmed);
  }
  const home = os.homedir();
  const codexHome = process.env.CODEX_HOME || path.join(home, ".codex");
  return path.join(codexHome, "skill-router", "routing.jsonl");
}

function logRouting(entry) {
  try {
    const logPath = resolveLogPath();
    if (!logPath) return;
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const record = Object.assign({ ts: new Date().toISOString() }, entry);
    fs.appendFileSync(logPath, JSON.stringify(record) + "\n", "utf8");
  } catch {
    // Logging must never break routing.
  }
}

module.exports = { searchSkills, logRouting, truncateForLog };
if (require.main === module) runCli();
