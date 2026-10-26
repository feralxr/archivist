#!/usr/bin/env tsx
/**
 * Golden-diff eval harness for Archivist review quality.
 *
 *   npm run eval
 *
 * Requires a model API key. Writes results to fixtures/eval/last-results.json
 */

import { config as loadEnv } from "dotenv";
loadEnv();

import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

interface Expect {
  minComments?: number;
  maxComments?: number;
  mustHaveSeverity?: string[];
  summaryNotEmpty?: boolean;
}

interface Case {
  id: string;
  diff: string;
  title?: string;
  memory?: {
    styleRules?: string[];
    discouraged?: string[];
    preferred?: string[];
  };
  expect: Expect;
}

async function main() {
  const hasKey = Boolean(
    process.env.OPENROUTER_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY
  );
  if (!hasKey) {
    console.error("No model API key. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or OPENROUTER_API_KEY.");
    process.exit(1);
  }

  const dataDir = mkdtempSync(join(tmpdir(), "archivist-eval-"));
  process.env.ARCHIVIST_DATA_DIR = dataDir;

  const { memoryStore } = await import("../src/memory/store.js");
  const { createModelFromEnv } = await import("../src/models/provider.js");
  const { ReviewEngine } = await import("../src/review/engine.js");

  const root = join(process.cwd(), "fixtures/eval");
  const manifest = JSON.parse(
    readFileSync(join(root, "manifest.json"), "utf-8")
  ) as { cases: Case[] };

  const model = createModelFromEnv({ role: "review" });
  const engine = new ReviewEngine(model);

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║         Archivist — Review Quality Eval              ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`Model : ${model.name} / ${model.model}`);
  console.log(`Cases : ${manifest.cases.length}\n`);

  const results: Array<Record<string, unknown>> = [];
  let passed = 0;
  let failed = 0;

  for (const c of manifest.cases) {
    const repoId = `eval-${c.id}-${randomUUID().slice(0, 6)}`;
    await memoryStore.create(repoId, `eval/${c.id}`);

    for (const rule of c.memory?.styleRules || []) {
      await memoryStore.addStyleRule(repoId, {
        rule,
        source: "manual",
        confidence: 1,
      });
    }
    for (const d of c.memory?.discouraged || []) {
      await memoryStore.addPattern(repoId, {
        description: d,
        preferred: false,
      });
    }
    for (const p of c.memory?.preferred || []) {
      await memoryStore.addPattern(repoId, {
        description: p,
        preferred: true,
      });
    }

    const diffPath = join(root, c.diff);
    if (!existsSync(diffPath)) {
      console.log(`  ✗  ${c.id}  (missing diff file)`);
      failed++;
      continue;
    }
    const diff = readFileSync(diffPath, "utf-8");

    const start = Date.now();
    let error: string | undefined;
    let summary = "";
    let comments: Array<{ severity: string; body: string; path: string }> = [];

    try {
      const result = await engine.review({
        repoId,
        diff,
        title: c.title,
      });
      summary = result.summary;
      comments = result.comments.map((x) => ({
        severity: x.severity,
        body: x.body,
        path: x.path,
      }));
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const ms = Date.now() - start;
    const checks: string[] = [];
    let ok = !error;

    if (error) {
      checks.push(`threw: ${error}`);
      ok = false;
    } else {
      if (c.expect.summaryNotEmpty !== false && summary.trim().length < 8) {
        ok = false;
        checks.push("empty summary");
      }
      if (c.expect.minComments != null && comments.length < c.expect.minComments) {
        ok = false;
        checks.push(`comments ${comments.length} < min ${c.expect.minComments}`);
      }
      if (c.expect.maxComments != null && comments.length > c.expect.maxComments) {
        ok = false;
        checks.push(`comments ${comments.length} > max ${c.expect.maxComments}`);
      }
      if (c.expect.mustHaveSeverity?.length) {
        const sevs = new Set(comments.map((x) => x.severity));
        const hit = c.expect.mustHaveSeverity.some((s) => sevs.has(s));
        if (!hit && comments.length === 0) {
          ok = false;
          checks.push(
            `expected one of severities [${c.expect.mustHaveSeverity.join(", ")}]`
          );
        } else if (!hit && comments.length > 0) {
          // soft: has comments but not required severity — still fail if mustHave set
          ok = false;
          checks.push(
            `severities ${[...sevs].join(",")} missing required ${c.expect.mustHaveSeverity.join("/")}`
          );
        }
      }
    }

    if (ok) {
      passed++;
      console.log(`  ✓  ${c.id}  (${ms}ms, ${comments.length} comments)`);
    } else {
      failed++;
      console.log(`  ✗  ${c.id}  (${ms}ms)`);
      for (const ch of checks) console.log(`     - ${ch}`);
    }

    results.push({
      id: c.id,
      ok,
      ms,
      summary: summary.slice(0, 300),
      comments,
      checks,
      error,
    });
  }

  // Aggregate metrics
  const allComments = results.flatMap((r) => (r.comments as any[]) || []);
  const severityCounts: Record<string, number> = {};
  for (const c of allComments) {
    const s = String(c.severity || "unknown");
    severityCounts[s] = (severityCounts[s] || 0) + 1;
  }
  const times = results.map((r) => Number(r.ms) || 0).filter((n) => n > 0);
  const avgMs = times.length
    ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
    : 0;
  const p95Ms = times.length
    ? times.sort((a, b) => a - b)[Math.min(times.length - 1, Math.floor(times.length * 0.95))]
    : 0;

  const out = join(root, "last-results.json");
  const report = {
    model: `${model.name}/${model.model}`,
    profile: process.env.ARCHIVIST_PROMPT_PROFILE || "balanced",
    at: new Date().toISOString(),
    passed,
    failed,
    total: passed + failed,
    passRate: passed + failed ? passed / (passed + failed) : 0,
    metrics: {
      avgLatencyMs: avgMs,
      p95LatencyMs: p95Ms,
      totalComments: allComments.length,
      severityCounts,
    },
    results,
  };
  writeFileSync(out, JSON.stringify(report, null, 2), "utf-8");

  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  console.log("\n────────────────────────────────────────────────────");
  console.log(`Passed : ${passed}`);
  console.log(`Failed : ${failed}`);
  console.log(`Pass % : ${report.passRate ? Math.round(report.passRate * 100) : 0}%`);
  console.log(`Avg ms : ${avgMs}  ·  p95: ${p95Ms}`);
  console.log(`Comments total: ${allComments.length}  ·  severities: ${JSON.stringify(severityCounts)}`);
  console.log(`Wrote  : ${out}`);
  console.log("────────────────────────────────────────────────────\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
