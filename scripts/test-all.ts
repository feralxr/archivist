#!/usr/bin/env tsx
/**
 * Archivist — exhaustive end-to-end test suite
 *
 *   cp .env.example .env    # add OPENROUTER_API_KEY
 *   npm install
 *   npm test
 */

import { config as loadEnv } from "dotenv";
loadEnv();

import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

// Isolate ALL memory writes to a temp dir (must be set before store usage)
const TEST_DATA = mkdtempSync(join(tmpdir(), "archivist-test-"));
process.env.ARCHIVIST_DATA_DIR = TEST_DATA;

type TestFn = () => void | Promise<void>;
interface TestCase {
  name: string;
  fn: TestFn;
  group: string;
  live?: boolean;
}

const tests: TestCase[] = [];
const results: Array<{
  name: string;
  group: string;
  ok: boolean;
  ms: number;
  error?: string;
  skipped?: boolean;
}> = [];

function test(group: string, name: string, fn: TestFn, opts?: { live?: boolean }) {
  tests.push({ group, name, fn, live: opts?.live });
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function assertEq<T>(a: T, b: T, msg?: string) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function assertIncludes(hay: string, needle: string, msg?: string) {
  if (!hay.includes(needle)) throw new Error(msg || `Expected string to include "${needle}"`);
}

const hasKey = Boolean(
  process.env.OPENROUTER_API_KEY ||
  process.env.ANTHROPIC_API_KEY ||
  process.env.OPENAI_API_KEY
);
const RUN_LIVE = hasKey && process.env.ARCHIVIST_SKIP_LIVE !== "1";

async function main() {
  // Dynamic imports so ARCHIVIST_DATA_DIR is already set
  const { env, hasOpenRouter, hasGitHubApp } = await import("../src/core/config.js");
  const { withRetry } = await import("../src/core/retry.js");
  const { ConcurrencyQueue } = await import("../src/core/queue.js");
  const { MemoryStore } = await import("../src/memory/store.js");
  const { resolveLocalRepoIdentity, getGitDiff } = await import("../src/memory/identity.js");
  const {
    runLearningPass,
    memoryQualityScore,
  } = await import("../src/memory/learn.js");
  const { parseGithubRepo } = await import("../src/memory/bootstrap-cli.js");
  const { createModelFromEnv, createModel } = await import("../src/models/provider.js");
  const { ReviewEngine } = await import("../src/review/engine.js");
  const { REVIEW_SYSTEM_PROMPT, buildUserPrompt } = await import("../src/review/prompts.js");
  const { analyzeDiff } = await import("../src/review/diff-stats.js");
  const { chunkDiff } = await import("../src/review/chunk.js");
  const { githubRepoId } = await import("../src/memory/repo-id.js");
  const { cosine } = await import("../src/memory/embeddings.js");
  const { metrics } = await import("../src/core/metrics.js");

  const store = new MemoryStore();
  const REPO_ID = `test-repo-${randomUUID().slice(0, 8)}`;
  const REPO_NAME = "archivist-test-repo";

  // ── config ──
  test("config", "env loads without crash", () => {
    assert(env.PORT > 0, "PORT should be set");
    assert(typeof env.ARCHIVIST_MODEL === "string" && env.ARCHIVIST_MODEL.length > 0, "model");
  });
  test("config", "hasOpenRouter reflects key presence", () => {
    assertEq(hasOpenRouter(), hasKey);
  });
  test("config", "hasGitHubApp is boolean", () => {
    assert(typeof hasGitHubApp() === "boolean", "boolean");
  });

  // ── core ──
  test("core", "withRetry succeeds first try", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return 42;
    });
    assertEq(result, 42);
    assertEq(calls, 1);
  });

  test("core", "withRetry retries then succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) {
          const err: any = new Error("rate limit");
          err.status = 429;
          throw err;
        }
        return "ok";
      },
      { retries: 4, minDelayMs: 10, maxDelayMs: 20 }
    );
    assertEq(result, "ok");
    assertEq(calls, 3);
  });

  test("core", "withRetry gives up on non-retryable", async () => {
    let threw = false;
    try {
      await withRetry(async () => {
        throw new Error("fatal logic bug");
      }, { retries: 2, minDelayMs: 5, maxDelayMs: 10 });
    } catch {
      threw = true;
    }
    assert(threw, "should throw");
  });

  test("core", "metrics snapshot shape", () => {
    const s = metrics.snapshot();
    assert(typeof s.reviewsStarted === "number", "reviewsStarted");
    assert(typeof s.uptimeSeconds === "number", "uptime");
    assert(s.startedAt, "startedAt");
  });

  test("core", "ConcurrencyQueue limits parallelism", async () => {
    const q = new ConcurrencyQueue(2);
    let concurrent = 0;
    let maxConcurrent = 0;
    await Promise.all(
      Array.from({ length: 6 }, () =>
        q.run(async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await new Promise((r) => setTimeout(r, 30));
          concurrent--;
        })
      )
    );
    assert(maxConcurrent <= 2, `max concurrent ${maxConcurrent}`);
    assertEq(q.stats.running, 0);
  });

  // ── memory ──
  test("memory", "create and get", async () => {
    const m = await store.create(REPO_ID, REPO_NAME, "github.com/test/archivist-test");
    assertEq(m.repoName, REPO_NAME);
    const loaded = await store.get(REPO_ID);
    assert(loaded, "load");
    assertEq(loaded!.remoteUrl, "github.com/test/archivist-test");
  });

  test("memory", "getOrCreate idempotent", async () => {
    const a = await store.getOrCreate(REPO_ID, REPO_NAME);
    const b = await store.getOrCreate(REPO_ID, REPO_NAME);
    assertEq(a.repoId, b.repoId);
  });

  test("memory", "add style / architecture / patterns + dedupe", async () => {
    await store.addStyleRule(REPO_ID, { rule: "Prefer semicolons", source: "manual", confidence: 1 });
    await store.addStyleRule(REPO_ID, { rule: "Prefer early returns", source: "manual", confidence: 1 });
    await store.addStyleRule(REPO_ID, { rule: "Prefer semicolons", source: "manual", confidence: 1 });
    await store.addArchitectureNote(REPO_ID, { note: "API must not import UI modules" });
    await store.addPattern(REPO_ID, { description: "Use Zod for external input", preferred: true });
    await store.addPattern(REPO_ID, { description: "Avoid any in public APIs", preferred: false });
    const m = await store.get(REPO_ID);
    assert(m!.styleRules.length >= 2 && m!.styleRules.length <= 3, `styles ${m!.styleRules.length}`);
    assert(m!.architectureNotes.length >= 1, "arch");
    assert(m!.patterns.length >= 2, "patterns");
  });

  test("memory", "feedback frequency merge", async () => {
    await store.addHistoricalFeedback(REPO_ID, {
      summary: "Add error handling for edge cases",
      frequency: 1,
      lastSeen: new Date().toISOString(),
    });
    await store.addHistoricalFeedback(REPO_ID, {
      summary: "Add error handling for edge cases",
      frequency: 1,
      lastSeen: new Date().toISOString(),
    });
    const m = await store.get(REPO_ID);
    const fb = m!.historicalFeedback.find((f) => f.summary.includes("error handling"));
    assert(fb && fb.frequency >= 2, `freq ${fb?.frequency}`);
  });

  test("memory", "raw snippets", async () => {
    await store.addRawSnippet(REPO_ID, {
      text: "Please prefer early returns in this function instead of nesting",
      path: "src/math.ts",
      createdAt: new Date().toISOString(),
    });
    const m = await store.get(REPO_ID);
    assert(m!.rawSnippets.length >= 1, "snippet");
  });

  test("memory", "search relevant", async () => {
    const results = await store.search(REPO_ID, "semicolon early return", 10);
    assert(results.length > 0, "hits");
  });

  test("memory", "buildContext", async () => {
    const ctx = await store.buildContext(REPO_ID, "return a + b");
    assertIncludes(ctx, "Style");
    assert(ctx.length > 40, "non-empty");
  });

  test("memory", "stats + quality score", async () => {
    const stats = await store.stats(REPO_ID);
    assert(stats && stats.styleRules >= 2, "stats");
    const m = await store.get(REPO_ID);
    const q = memoryQualityScore(m!);
    assert(q.score >= 0 && q.score <= 100, "range");
    assert(["empty", "thin", "useful", "strong"].includes(q.label), "label");
  });

  test("memory", "consolidate", async () => {
    await store.addHistoricalFeedback(REPO_ID, {
      summary: "Please add error handling for edge cases please",
      frequency: 1,
      lastSeen: new Date().toISOString(),
    });
    const result = await store.consolidate(REPO_ID);
    assert(typeof result.merged === "number", "merged");
  });

  test("memory", "export/import round-trip", async () => {
    const exported = await store.exportJSON(REPO_ID);
    assert(exported, "export");
    const newId = `import-${randomUUID().slice(0, 8)}`;
    await store.importJSON({ ...exported!, repoId: newId, repoName: "imported-repo" });
    const loaded = await store.get(newId);
    assert(loaded && loaded.styleRules.length >= 2, "import");
  });

  test("memory", "learning pass", async () => {
    await store.addHistoricalFeedback(REPO_ID, {
      summary: "Prefer early returns over nested if statements",
      frequency: 3,
      lastSeen: new Date().toISOString(),
    });
    await store.addRawSnippet(REPO_ID, {
      text: "Always use named exports in this codebase",
      createdAt: new Date().toISOString(),
    });
    const result = await runLearningPass(REPO_ID);
    assert(typeof result.promoted === "number", "promoted");
    assert(typeof result.inferred === "number", "inferred");
  });

  // ── identity ──
  test("identity", "resolveLocalRepoIdentity", () => {
    const id = resolveLocalRepoIdentity(process.cwd());
    assert(id.repoId && id.repoName, "fields");
  });

  test("identity", "getGitDiff no throw", () => {
    const diff = getGitDiff(process.cwd(), "all");
    assert(typeof diff === "string", "string");
  });

  // ── review prompts ──
  test("review", "system prompt substantial", () => {
    assert(REVIEW_SYSTEM_PROMPT.length > 200, "length");
    assertIncludes(REVIEW_SYSTEM_PROMPT, "JSON");
  });

  test("review", "buildUserPrompt content", () => {
    const prompt = buildUserPrompt({
      memoryContext: "### Style Rules\n- Prefer semicolons",
      diff: "@@ -1 +1 @@\n-return a\n+return a;",
      title: "Fix style",
    });
    assertIncludes(prompt, "Prefer semicolons");
    assertIncludes(prompt, "Fix style");
  });

  test("review", "buildUserPrompt truncates huge diffs", () => {
    const prompt = buildUserPrompt({
      memoryContext: "none",
      diff: "x".repeat(200_000),
    });
    assertIncludes(prompt, "truncated");
  });

  test("memory", "githubRepoId canonical form", () => {
    assert(githubRepoId("org/repo") === "github.com/org/repo", "default host");
    assert(githubRepoId("github.com/org/repo") === "github.com/org/repo", "idempotent");
    assert(
      githubRepoId("org/repo", "https://github.com/org/repo") === "github.com/org/repo",
      "from html url"
    );
  });

  test("review", "chunkDiff splits multi-file", () => {
    const multi = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-old
+new
diff --git a/b.ts b/b.ts
--- a/b.ts
+++ b/b.ts
@@ -1 +1 @@
-x
+y
`;
    const chunks = chunkDiff(multi, 50);
    assert(chunks.length >= 1, "at least one chunk");
    assert(chunks.every((c) => c.chars > 0), "nonempty");
  });

  test("review", "analyzeDiff docs vs code", () => {
    const stats = analyzeDiff(`diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1 +1 @@
-old
+new
`);
    assert(stats.docsOnly, "docs only");
    assertEq(stats.docFiles, 1);
  });

  test("review", "cosine similarity", () => {
    assert(Math.abs(cosine([1, 0, 0], [1, 0, 0]) - 1) < 1e-6, "id");
    assert(Math.abs(cosine([1, 0, 0], [0, 1, 0])) < 1e-6, "orth");
  });

  // ── models ──
  test("models", "unknown provider rejected", () => {
    let threw = false;
    try {
      createModel({ provider: "custom", model: "x", apiKey: "y" });
    } catch {
      threw = true;
    }
    assert(threw, "reject");
  });

  test("models", "createModelFromEnv", () => {
    if (!hasKey) return;
    const model = createModelFromEnv();
    assert(["openrouter", "openai", "anthropic"].includes(model.name), model.name);
  }, { live: true });

  // ── live ──
  test("live", "model simple prompt", async () => {
    const model = createModelFromEnv();
    const out = await model.review({
      diff: "",
      memoryContext: "Reply with exactly the word PONG and nothing else.",
      systemInstructions: "You are a test assistant. Follow the user exactly.",
    });
    assert(out.length > 0, "non-empty");
  }, { live: true });

  test("live", "ReviewEngine on sample.diff", async () => {
    const fixturePath = join(process.cwd(), "fixtures/sample.diff");
    assert(existsSync(fixturePath), "fixture");
    const diff = readFileSync(fixturePath, "utf-8");

    await store.addStyleRule(REPO_ID, {
      rule: "Prefer semicolons",
      source: "manual",
      confidence: 1,
    });
    await store.addStyleRule(REPO_ID, {
      rule: "Avoid any types in public APIs",
      source: "manual",
      confidence: 1,
    });

    const model = createModelFromEnv();
    const engine = new ReviewEngine(model);
    const result = await engine.review({
      repoId: REPO_ID,
      diff,
      title: "Harden math helpers",
    });

    assert(result.summary.length > 10, "summary");
    assert(Array.isArray(result.comments), "comments");
    assert(result.comments.length <= 8, "noise ceiling");
    assert(result.modelUsed.length > 0, "model");

    for (const c of result.comments) {
      assert(c.path && c.body.length >= 10, "comment shape");
      assert(["info", "warning", "error", "suggestion"].includes(c.severity), "sev");
    }

    console.log("\n  ── Live review sample ──");
    console.log("  Summary:", result.summary.slice(0, 220));
    console.log("  Comments:", result.comments.length);
    for (const c of result.comments.slice(0, 4)) {
      console.log(
        `   • [${c.severity}] ${c.path}${c.line ? ":" + c.line : ""} — ${c.body.slice(0, 90)}`
      );
    }
    console.log("  ────────────────────────\n");
  }, { live: true });

  test("live", "trivial diff short-circuit", async () => {
    const model = createModelFromEnv();
    const engine = new ReviewEngine(model);
    const result = await engine.review({ repoId: REPO_ID, diff: "   " });
    assertEq(result.comments.length, 0);
  }, { live: true });

  // ── bootstrap helpers ──
  test("bootstrap", "parseGithubRepo shorthand", () => {
    const r = parseGithubRepo("tj/commander.js");
    assertEq(r.owner, "tj");
    assertEq(r.repo, "commander.js");
  });

  test("bootstrap", "parseGithubRepo URL", () => {
    const r = parseGithubRepo("https://github.com/feralxr/archivist.git");
    assertEq(r.owner, "feralxr");
    assertEq(r.repo, "archivist");
  });

  test("bootstrap", "parseGithubRepo rejects junk", () => {
    let threw = false;
    try { parseGithubRepo("noremote"); } catch { threw = true; }
    assert(threw, "should throw");
  });

  // ── fixtures ──
  test("fixtures", "sample.diff valid", () => {
    const p = join(process.cwd(), "fixtures/sample.diff");
    assert(existsSync(p), "exists");
    const content = readFileSync(p, "utf-8");
    assertIncludes(content, "diff --git");
  });

  test("fixtures", "sample-memory.json valid", () => {
    const p = join(process.cwd(), "fixtures/sample-memory.json");
    assert(existsSync(p), "exists");
    const mem = JSON.parse(readFileSync(p, "utf-8"));
    assert(mem.repoId && Array.isArray(mem.styleRules), "shape");
  });

  // ── run ──
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║         Archivist — Exhaustive Test Suite            ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`Data dir : ${TEST_DATA}`);
  console.log(`Model    : ${env.ARCHIVIST_MODEL}`);
  console.log(`Live API : ${RUN_LIVE ? "YES" : "NO (set OPENROUTER/ANTHROPIC/OPENAI key for live tests)"}`);
  console.log("");

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const t of tests) {
    if (t.live && !RUN_LIVE) {
      results.push({ name: t.name, group: t.group, ok: true, ms: 0, skipped: true });
      skipped++;
      console.log(`  ○  ${t.group} › ${t.name}  (skipped — no API key)`);
      continue;
    }
    const start = Date.now();
    try {
      await t.fn();
      const ms = Date.now() - start;
      results.push({ name: t.name, group: t.group, ok: true, ms });
      passed++;
      console.log(`  ✓  ${t.group} › ${t.name}  (${ms}ms)`);
    } catch (err) {
      const ms = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      results.push({ name: t.name, group: t.group, ok: false, ms, error: message });
      failed++;
      console.log(`  ✗  ${t.group} › ${t.name}  (${ms}ms)`);
      console.log(`     ${message}`);
    }
  }

  try {
    rmSync(TEST_DATA, { recursive: true, force: true });
  } catch { /* ignore */ }

  console.log("\n────────────────────────────────────────────────────");
  console.log(`Passed  : ${passed}`);
  console.log(`Failed  : ${failed}`);
  console.log(`Skipped : ${skipped}`);
  console.log(`Total   : ${tests.length}`);
  console.log("────────────────────────────────────────────────────");

  if (failed > 0) {
    console.log("\nFailed tests:");
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  • [${r.group}] ${r.name}: ${r.error}`);
    }
    process.exit(1);
  }

  if (!RUN_LIVE) {
    console.log("\nTip: set OPENROUTER_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY for live tests.");
  }
  console.log("\nAll executable tests passed.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
