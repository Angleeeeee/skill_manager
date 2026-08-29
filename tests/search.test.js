"use strict";

// Retrieval-layer unit tests for skill-router.
//
// Zero dependencies on purpose: runs with the Node standard library only
// (`node --test`), matching the plugin's own no-npm-install promise.
//
// Assertions target *behavior* (ordering, presence/absence, thresholds), not
// exact floating-point scores, so they stay stable when fixtures or IDF
// weights change.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const FIXTURES = path.join(__dirname, "fixtures");
const FIXTURE_NAMES = new Set([
  "demo-hello",
  "ue-datatable-validate",
  "ue-render-pipeline",
  "skill-router",
]);

// Hermetic environment. Point CODEX_HOME and cwd at empty temp locations so
// the only indexed skills come from tests/fixtures; keep the routing log off
// except in the logging tests below, which redirect it explicitly.
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "skill-router-test-"));
process.env.CODEX_HOME = path.join(WORK, "codex-home");
process.env.SKILL_ROUTER_LOG = "off";

const { searchSkills, logRouting, truncateForLog } = require(
  "../plugins/skill-router/skills/skill-router/scripts/search-skills.js",
);

function search(query, options = {}) {
  return searchSkills({
    query,
    roots: [FIXTURES],
    cwd: WORK,
    limit: options.limit ?? 5,
    minScore: options.minScore ?? 25,
    includeRouter: options.includeRouter ?? false,
  });
}

function fixtureCandidates(result) {
  return result.candidates.filter((candidate) => FIXTURE_NAMES.has(candidate.name));
}
function fixtureNames(result) {
  return fixtureCandidates(result).map((candidate) => candidate.name);
}

test("English name terms surface the matching skill first", () => {
  const result = search("validate UE5 DataTable", { minScore: 5 });
  const names = fixtureNames(result);
  assert.ok(names.includes("ue-datatable-validate"), `expected datatable skill, got ${names}`);
  const datatable = fixtureCandidates(result).find((c) => c.name === "ue-datatable-validate");
  const others = fixtureCandidates(result).filter((c) => c.name !== "ue-datatable-validate");
  for (const other of others) {
    assert.ok(datatable.score > other.score, `datatable (${datatable.score}) should outrank ${other.name} (${other.score})`);
  }
});

test("negative-context clause is penalized, not matched", () => {
  // The datatable skill says "不用于渲染管线和光照设置"; a query about exactly
  // that must NOT surface it, while the genuine render-pipeline skill should.
  const result = search("渲染管线 光照设置", { minScore: 5 });
  const names = fixtureNames(result);
  assert.ok(!names.includes("ue-datatable-validate"), `negative skill leaked into ${names}`);
  assert.ok(names.includes("ue-render-pipeline"), `expected render-pipeline, got ${names}`);
});

test("known limit: pure-Chinese query misses English-named skills", () => {
  // Documents the lexical recall floor honestly: without an English alias the
  // English-named datatable skill does not clear the default score floor.
  const result = search("数据表校验", { minScore: 25 });
  assert.ok(!fixtureNames(result).includes("ue-datatable-validate"));
});

test("cross-language alias retry recovers the missed skill", () => {
  const result = search("数据表校验 datatable validate", { minScore: 25 });
  assert.ok(fixtureNames(result).includes("ue-datatable-validate"), "alias retry should surface the skill");
});

test("empty query yields no candidates and does not throw", () => {
  const result = search("", { minScore: 0 });
  assert.deepEqual(result.candidates, []);
});

test("stopword-only query yields no candidates", () => {
  const result = search("帮我 使用 一下", { minScore: 0 });
  assert.deepEqual(result.candidates, []);
});

test("limit caps the number of candidates", () => {
  const result = search("validate UE5 DataTable", { minScore: 5, limit: 1 });
  assert.ok(result.candidates.length <= 1);
  assert.equal(result.candidates[0].name, "ue-datatable-validate");
});

test("minScore floor filters weak matches", () => {
  const kept = search("validate UE5 DataTable", { minScore: 20 });
  const dropped = search("validate UE5 DataTable", { minScore: 40 });
  assert.ok(fixtureNames(kept).includes("ue-datatable-validate"), "score ~31 should pass minScore 20");
  assert.ok(!fixtureNames(dropped).includes("ue-datatable-validate"), "score ~31 should fail minScore 40");
});

test("the skill-router skill is excluded by default but opt-in via includeRouter", () => {
  const hidden = search("skill router routing", { minScore: 5, includeRouter: false });
  const shown = search("skill router routing", { minScore: 5, includeRouter: true });
  assert.ok(!fixtureNames(hidden).includes("skill-router"), "router must not route to itself by default");
  assert.ok(fixtureNames(shown).includes("skill-router"), "includeRouter should surface it");
});

test("every returned candidate honors minScore and carries its contract fields", () => {
  const minScore = 5;
  const result = search("validate UE5 DataTable 渲染", { minScore });
  assert.ok(result.candidates.length > 0, "expected at least one candidate");
  for (const candidate of result.candidates) {
    assert.ok(candidate.score >= minScore);
    assert.ok(candidate.coverage >= 0 && candidate.coverage <= 1);
    assert.equal(typeof candidate.name, "string");
    assert.ok(Array.isArray(candidate.matches));
    assert.equal(typeof candidate.description, "string");
    assert.ok(fs.existsSync(candidate.path), `candidate path must exist: ${candidate.path}`);
  }
});

test("truncateForLog collapses whitespace and caps at 160 chars with ellipsis", () => {
  assert.equal(truncateForLog("  hello   world "), "hello world");
  const long = truncateForLog("x".repeat(300));
  assert.equal(long.length, 160);
  assert.ok(long.endsWith("…"));
});

test("logRouting writes one JSON line per call when enabled", () => {
  const logPath = path.join(WORK, "routing-enabled.jsonl");
  process.env.SKILL_ROUTER_LOG = logPath;
  try {
    logRouting({ event: "routed", candidateCount: 1 });
    logRouting({ event: "skip", reason: "trivial" });
    const lines = fs.readFileSync(logPath, "utf8").trim().split("\n");
    assert.equal(lines.length, 2);
    const [first, second] = lines.map((line) => JSON.parse(line));
    assert.equal(first.event, "routed");
    assert.equal(first.candidateCount, 1);
    assert.equal(second.reason, "trivial");
    for (const record of [first, second]) {
      assert.equal(typeof record.ts, "string");
      assert.ok(!Number.isNaN(Date.parse(record.ts)), "ts must be a valid ISO timestamp");
    }
  } finally {
    process.env.SKILL_ROUTER_LOG = "off";
  }
});

test("logRouting is silent and writes nothing when disabled", () => {
  const logPath = path.join(WORK, "routing-disabled.jsonl");
  process.env.SKILL_ROUTER_LOG = "off";
  logRouting({ event: "routed" });
  assert.equal(fs.existsSync(logPath), false);
});

test("logRouting never throws even when the target is unusable", () => {
  // Point at a path that cannot be created (a file standing in for a directory).
  const blocker = path.join(WORK, "blocker");
  fs.writeFileSync(blocker, "x");
  process.env.SKILL_ROUTER_LOG = path.join(blocker, "nested", "routing.jsonl");
  try {
    assert.doesNotThrow(() => logRouting({ event: "search_error" }));
  } finally {
    process.env.SKILL_ROUTER_LOG = "off";
  }
});
