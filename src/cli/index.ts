#!/usr/bin/env node
import { Command } from "commander";
import { render } from "ink";
import React from "react";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { App } from "./ui/App.js";
import { createModelFromEnv } from "../models/provider.js";
import { hasOpenRouter, hasAnthropic, hasOpenAI, hasAnyModelKey, hasGitHubApp, env } from "../core/config.js";
import { memoryStore } from "../memory/store.js";
import { ReviewEngine } from "../review/engine.js";
import { resolveLocalRepoIdentity, getGitDiff } from "../memory/identity.js";
import { runLearningPass, memoryQualityScore } from "../memory/learn.js";
import { bootstrapFromGitHubApi, parseGithubRepo } from "../memory/bootstrap-cli.js";

const program = new Command();

program
  .name("archivist")
  .description("Memory-aware code review — local CLI and GitHub App")
  .version("0.1.0")
  .option("--cwd <path>", "Run as if started in this directory (for multi-repo workflows)");

function workDir(): string {
  const cwd = program.opts().cwd as string | undefined;
  if (cwd) {
    process.chdir(cwd);
    return process.cwd();
  }
  return process.cwd();
}

// ── Setup / health ──────────────────────────────────────────

program
  .command("setup")
  .description("Show setup instructions")
  .action(() => {
    console.log(`
Archivist setup
───────────────
1. Model key (at least one)
   OPENROUTER_API_KEY=...   # free models: https://openrouter.ai
   ANTHROPIC_API_KEY=...    # Claude
   OPENAI_API_KEY=...       # GPT
   ARCHIVIST_PROVIDER=openai   # optional force
   ARCHIVIST_MODEL=gpt-4o-mini

2. Local workflow
   archivist init
   archivist memory:add -t style -c "Prefer early returns"
   archivist review              # reviews current git diff
   archivist review --staged
   archivist review --file changes.diff

3. GitHub App (automatic PR reviews)
   See docs/GITHUB_APP.md

Status: OpenRouter ${hasOpenRouter() ? "✓" : "✗"}  Anthropic ${hasAnthropic() ? "✓" : "✗"}  OpenAI ${hasOpenAI() ? "✓" : "✗"}  App ${hasGitHubApp() ? "✓" : "✗"}
`);
  });

program
  .command("doctor")
  .description("Check configuration health")
  .action(async () => {
    workDir();
    console.log("\nArchivist Doctor\n");
    const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

    checks.push({
      name: "OpenRouter key",
      ok: hasOpenRouter(),
      detail: hasOpenRouter() ? "set" : "not set",
    });
    checks.push({
      name: "Anthropic key",
      ok: hasAnthropic(),
      detail: hasAnthropic() ? "set" : "not set",
    });
    checks.push({
      name: "OpenAI key",
      ok: hasOpenAI(),
      detail: hasOpenAI() ? "set" : "not set",
    });
    checks.push({
      name: "Any model key",
      ok: hasAnyModelKey(),
      detail: hasAnyModelKey() ? "ok" : "missing — set OPENROUTER, ANTHROPIC, or OPENAI key",
    });
    checks.push({
      name: "GitHub App ID",
      ok: Boolean(env.GITHUB_APP_ID),
      detail: env.GITHUB_APP_ID ? String(env.GITHUB_APP_ID) : "missing (only needed for server)",
    });
    checks.push({
      name: "GitHub Private Key",
      ok: Boolean(env.GITHUB_PRIVATE_KEY),
      detail: env.GITHUB_PRIVATE_KEY ? "set" : "missing (only needed for server)",
    });
    checks.push({ name: "Model", ok: true, detail: env.ARCHIVIST_MODEL });

    const { repoId, repoName, remoteUrl } = resolveLocalRepoIdentity();
    const memory = await memoryStore.get(repoId);
    checks.push({
      name: "Project memory",
      ok: Boolean(memory),
      detail: memory
        ? `${memory.repoName} v${memory.metadata.version}`
        : `none for ${repoName} — run archivist init`,
    });
    if (remoteUrl) {
      checks.push({ name: "Git remote", ok: true, detail: remoteUrl });
    }

    if (hasAnyModelKey()) {
      try {
        const model = createModelFromEnv();
        checks.push({
          name: "Model client",
          ok: true,
          detail: `${model.name}/${model.model}`,
        });
      } catch (err) {
        checks.push({
          name: "Model client",
          ok: false,
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }

    for (const c of checks) {
      console.log(`  ${c.ok ? "✓" : "✗"}  ${c.name.padEnd(20)} ${c.detail}`);
    }
    const failed = checks.filter((c) => !c.ok).length;
    console.log(
      failed === 0 ? "\nAll good.\n" : `\n${failed} issue(s). Run archivist setup.\n`
    );
  });

program
  .command("status")
  .description("Config + memory summary")
  .action(async () => {
    workDir();
    const { repoId, repoName, remoteUrl } = resolveLocalRepoIdentity();
    console.log("\nConfiguration");
    console.log(`  OpenRouter : ${hasOpenRouter() ? "yes" : "no"}`);
    console.log(`  Anthropic  : ${hasAnthropic() ? "yes" : "no"}`);
    console.log(`  OpenAI     : ${hasOpenAI() ? "yes" : "no"}`);
    console.log(`  GitHub App : ${hasGitHubApp() ? "yes" : "no"}`);
    console.log(`  Model      : ${env.ARCHIVIST_MODEL}`);
    if (env.ARCHIVIST_PROVIDER) console.log(`  Provider   : ${env.ARCHIVIST_PROVIDER}`);
    console.log(`  Repo       : ${repoName}`);
    if (remoteUrl) console.log(`  Remote     : ${remoteUrl}`);

    const stats = await memoryStore.stats(repoId);
    console.log("\nProject Memory");
    if (!stats) {
      console.log("  (none — run archivist init)");
    } else {
      console.log(`  Version              ${stats.version}`);
      console.log(`  Style rules          ${stats.styleRules}`);
      console.log(`  Architecture notes   ${stats.architectureNotes}`);
      console.log(`  Preferred patterns   ${stats.preferredPatterns}`);
      console.log(`  Discouraged patterns ${stats.discouragedPatterns}`);
      console.log(`  Historical feedback  ${stats.historicalFeedback}`);
      console.log(`  Raw snippets         ${stats.rawSnippets}`);
      console.log(`  PRs analyzed         ${stats.prsAnalyzed}`);
      console.log(`  Embeddings           ${stats.hasEmbeddings ? "yes" : "no"}`);
      const mem = await memoryStore.get(repoId);
      if (mem) {
        const q = memoryQualityScore(mem);
        console.log(`  Quality              ${q.score}/100 (${q.label})`);
      }
    }
    console.log("");
  });

// ── Memory ──────────────────────────────────────────────────

program
  .command("init")
  .description("Initialize project memory for this repo")
  .option("-n, --name <name>", "Repository name override")
  .action(async (opts) => {
    workDir();
    const { repoId, repoName, remoteUrl } = resolveLocalRepoIdentity();
    const name = opts.name || repoName;

    const existing = await memoryStore.get(repoId);
    if (existing) {
      console.log(`Memory already exists: ${existing.repoName}`);
      console.log(
        `Version ${existing.metadata.version} · ${existing.metadata.prsAnalyzed} PRs analyzed`
      );
      return;
    }

    const memory = await memoryStore.create(repoId, name, remoteUrl);
    console.log(`✓ Created memory for ${memory.repoName}`);
    if (remoteUrl) console.log(`  Remote: ${remoteUrl}`);
    console.log(`  Data:  .archivist/`);
  });

program
  .command("memory")
  .description("Inspect project memory")
  .option("--json", "Raw JSON")
  .action(async (opts) => {
    workDir();
    const { repoId } = resolveLocalRepoIdentity();
    const memory = await memoryStore.get(repoId);

    if (!memory) {
      console.log("No memory found. Run `archivist init` first.");
      return;
    }

    // Persist report / last review
    if (opts.report) {
      const md = buildMarkdownReport(result, {
        title: opts.title,
        memoryId: repoId,
        ms,
      });
      writeFileSync(opts.report, md, "utf-8");
      if (!opts.json) console.log(`Report written: ${opts.report}`);
    }
    if (opts.save) {
      const { join } = await import("node:path");
      const dir = process.env.ARCHIVIST_DATA_DIR || join(process.cwd(), ".archivist");
      const { mkdirSync } = await import("node:fs");
      try { mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
      const out = join(dir, "last-review.json");
      writeFileSync(
        out,
        JSON.stringify(
          {
            at: new Date().toISOString(),
            memoryId: repoId,
            result,
          },
          null,
          2
        ),
        "utf-8"
      );
      if (!opts.json) console.log(`Saved: ${out}`);
    }

    if (opts.json) {
      console.log(JSON.stringify(memory, null, 2));
      return;
    }

    console.log(`\n${memory.repoName}`);
    if (memory.remoteUrl) console.log(`Remote   : ${memory.remoteUrl}`);
    console.log(`Updated  : ${memory.metadata.updatedAt}`);
    console.log(`Version  : ${memory.metadata.version}`);
    console.log(`PRs      : ${memory.metadata.prsAnalyzed}`);
    if (memory.metadata.lastBootstrapAt)
      console.log(`Bootstrap: ${memory.metadata.lastBootstrapAt}`);
    if (memory.metadata.lastConsolidatedAt)
      console.log(`Consolidate: ${memory.metadata.lastConsolidatedAt}`);
    console.log("");
    console.log(`Style rules          ${memory.styleRules.length}`);
    console.log(`Architecture notes   ${memory.architectureNotes.length}`);
    console.log(`Patterns             ${memory.patterns.length}`);
    console.log(`Historical feedback  ${memory.historicalFeedback.length}`);
    console.log(`Raw snippets         ${memory.rawSnippets.length}`);

    const short = (id: string) => id.slice(0, 8);

    if (memory.styleRules.length) {
      console.log("\n--- Style ---");
      memory.styleRules.slice(0, 20).forEach((r) => {
        const conf =
          typeof r.confidence === "number"
            ? ` conf=${r.confidence.toFixed(2)}`
            : "";
        const src = r.source ? ` [${r.source}]` : "";
        console.log(`• ${short(r.id)}  ${r.rule}${src}${conf}`);
      });
    }
    if (memory.architectureNotes.length) {
      console.log("\n--- Architecture ---");
      memory.architectureNotes.slice(0, 12).forEach((n) => {
        console.log(`• ${short(n.id)}  ${n.note}`);
      });
    }
    if (memory.patterns.length) {
      console.log("\n--- Patterns ---");
      memory.patterns.slice(0, 16).forEach((pat) => {
        console.log(
          `• ${short(pat.id)}  [${pat.preferred ? "preferred" : "discouraged"}] ${pat.description}`
        );
      });
    }
    if (memory.historicalFeedback.length) {
      console.log("\n--- Recurring feedback ---");
      memory.historicalFeedback
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 12)
        .forEach((f) =>
          console.log(
            `• ${short(f.id)}  (${f.frequency}×) ${f.summary.slice(0, 120)}`
          )
        );
    }
    if (memory.rawSnippets.length) {
      console.log("\n--- Recent snippets ---");
      memory.rawSnippets.slice(0, 6).forEach((s) => {
        console.log(`• ${short(s.id)}  ${s.text.slice(0, 100).replace(/\n/g, " ")}`);
      });
    }
    console.log("\nTip: archivist memory:show <id>  ·  archivist memory:rm <id>  ·  archivist memory:edit <id> -c \"...\"");
    console.log("");
  });


program
  .command("memory:rm")
  .description("Remove a memory item by id (prefix match ok)")
  .argument("<id>", "Full id or unique prefix from `archivist memory`")
  .action(async (id: string) => {
    workDir();
    const { repoId } = resolveLocalRepoIdentity();
    const result = await memoryStore.removeById(repoId, id);
    if (!result.removed) {
      console.error(`No item matching id "${id}". Run: archivist memory`);
      process.exit(1);
    }
    console.log(`✓ Removed ${result.type} ${id}`);
  });

program
  .command("memory:show")
  .description("Show one memory item by id")
  .argument("<id>", "Full id or unique prefix")
  .action(async (id: string) => {
    workDir();
    const { repoId } = resolveLocalRepoIdentity();
    const memory = await memoryStore.get(repoId);
    if (!memory) {
      console.error("No memory. Run archivist init.");
      process.exit(1);
    }
    const pools: Array<{ type: string; items: Array<{ id: string; [k: string]: unknown }> }> = [
      { type: "style", items: memory.styleRules },
      { type: "architecture", items: memory.architectureNotes },
      { type: "pattern", items: memory.patterns },
      { type: "feedback", items: memory.historicalFeedback },
      { type: "snippet", items: memory.rawSnippets },
    ];
    for (const pool of pools) {
      const hit = pool.items.find((x) => x.id === id || x.id.startsWith(id));
      if (hit) {
        console.log(`Type: ${pool.type}`);
        console.log(JSON.stringify(hit, null, 2));
        return;
      }
    }
    console.error(`No item matching "${id}"`);
    process.exit(1);
  });


program
  .command("memory:edit")
  .description("Edit a style rule, architecture note, or pattern by id")
  .argument("<id>", "Full id or unique prefix")
  .requiredOption("-c, --content <content>", "New text content")
  .action(async (id: string, opts: { content: string }) => {
    workDir();
    const { repoId } = resolveLocalRepoIdentity();
    const content = opts.content.trim();
    if (!content) {
      console.error("Content cannot be empty");
      process.exit(1);
    }
    const ok = await memoryStore.updateById(repoId, id, content);
    if (!ok) {
      console.error(
        `No editable item matching "${id}" (style/architecture/pattern).`
      );
      process.exit(1);
    }
    console.log(`✓ Updated ${id.slice(0, 8)}`);
  });

program
  .command("memory:add")
  .description("Add knowledge to project memory")
  .requiredOption("-t, --type <type>", "style | architecture | preferred | discouraged")
  .requiredOption("-c, --content <content>", "The rule or note")
  .action(async (opts) => {
    workDir();
    const { repoId, repoName, remoteUrl } = resolveLocalRepoIdentity();
    await memoryStore.getOrCreate(repoId, repoName, remoteUrl);

    switch (opts.type) {
      case "style":
        await memoryStore.addStyleRule(repoId, {
          rule: opts.content,
          source: "manual",
          confidence: 1,
        });
        break;
      case "architecture":
        await memoryStore.addArchitectureNote(repoId, { note: opts.content });
        break;
      case "preferred":
        await memoryStore.addPattern(repoId, {
          description: opts.content,
          preferred: true,
        });
        break;
      case "discouraged":
        await memoryStore.addPattern(repoId, {
          description: opts.content,
          preferred: false,
        });
        break;
      default:
        console.error("Type must be: style | architecture | preferred | discouraged");
        process.exit(1);
    }
    console.log(`✓ Added ${opts.type}`);
  });

program
  .command("memory:consolidate")
  .description("Merge duplicate feedback and trim low-value snippets")
  .action(async () => {
    workDir();
    const { repoId } = resolveLocalRepoIdentity();
    try {
      const result = await memoryStore.consolidate(repoId);
      console.log(
        `✓ Consolidated — merged ${result.merged} feedback items, trimmed ${result.trimmed} snippets`
      );
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program
  .command("memory:export")
  .description("Export project memory to a JSON file")
  .option("-o, --out <path>", "Output path", "archivist-memory.json")
  .action(async (opts) => {
    const { repoId } = resolveLocalRepoIdentity();
    const memory = await memoryStore.exportJSON(repoId);
    if (!memory) {
      console.error("No memory found. Run archivist init first.");
      process.exit(1);
    }
    writeFileSync(opts.out, JSON.stringify(memory, null, 2), "utf-8");
    console.log(`✓ Exported to ${opts.out}`);
  });

program
  .command("memory:import")
  .description("Import project memory from a JSON file")
  .requiredOption("-f, --file <path>", "JSON file path")
  .action(async (opts) => {
    if (!existsSync(opts.file)) {
      console.error(`File not found: ${opts.file}`);
      process.exit(1);
    }
    const raw = JSON.parse(readFileSync(opts.file, "utf-8"));
    await memoryStore.importJSON(raw);
    console.log(`✓ Imported memory for ${raw.repoName || raw.repoId}`);
  });

// ── Review (local) ──────────────────────────────────────────

program
  .command("review")
  .description("Review a diff using project memory (local)")
  .option("-f, --file <path>", "Path to a diff file")
  .option("-d, --diff <diff>", "Raw diff string")
  .option("--staged", "Review staged changes only")
  .option("--unstaged", "Review unstaged changes only")
  .option("--main", "Review diff against main/master")
  .option("--title <title>", "PR title context")
  .option("--memory-id <id>", "Use this memory id (e.g. github.com/org/repo)")
  .option("--json", "Print machine-readable JSON result")
  .option("--fail-on <level>", "Exit 1 if comments at this severity or higher: error|warning|suggestion")
  .option("--report <path>", "Write a markdown report to this path")
  .option("--save", "Save last review JSON under .archivist/last-review.json")
  .action(async (opts) => {
    const cwd = workDir();
    if (!hasAnyModelKey()) {
      console.error(
        "No model API key found.\n" +
          "Set OPENROUTER_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY in .env"
      );
      process.exit(1);
    }

    let diff = opts.diff as string | undefined;

    if (opts.file) {
      if (!existsSync(opts.file)) {
        console.error(`File not found: ${opts.file}`);
        process.exit(1);
      }
      diff = readFileSync(opts.file, "utf-8");
    }

    if (!diff) {
      const mode = opts.staged
        ? "staged"
        : opts.unstaged
          ? "unstaged"
          : opts.main
            ? "main"
            : "all";
      diff = getGitDiff(cwd, mode);
      if (!diff || diff.trim().length < 5) {
        console.error(
          "No diff found. Commit status is clean, or pass --file / --diff."
        );
        process.exit(1);
      }
      console.log(`Using git diff (${mode}) · ${diff.length} chars`);
    }

    const identity = resolveLocalRepoIdentity();
    const repoId = (opts.memoryId as string) || identity.repoId;
    const repoName = identity.repoName;
    const remoteUrl = identity.remoteUrl;
    await memoryStore.getOrCreate(repoId, repoName, remoteUrl);

    const model = createModelFromEnv();
    const engine = new ReviewEngine(model);

    console.log(`Model  : ${model.name} / ${model.model}`);
    console.log(`Memory : ${repoId}`);
    console.log("Reviewing...\n");

    const started = Date.now();
    const result = await engine.review({
      repoId,
      diff,
      title: opts.title,
    });
    const ms = Date.now() - started;

    // Persist report / last review
    if (opts.report) {
      const md = buildMarkdownReport(result, {
        title: opts.title,
        memoryId: repoId,
        ms,
      });
      writeFileSync(opts.report, md, "utf-8");
      if (!opts.json) console.log(`Report written: ${opts.report}`);
    }
    if (opts.save) {
      const { join } = await import("node:path");
      const dir = process.env.ARCHIVIST_DATA_DIR || join(process.cwd(), ".archivist");
      const { mkdirSync } = await import("node:fs");
      try { mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
      const out = join(dir, "last-review.json");
      writeFileSync(
        out,
        JSON.stringify(
          {
            at: new Date().toISOString(),
            memoryId: repoId,
            result,
          },
          null,
          2
        ),
        "utf-8"
      );
      if (!opts.json) console.log(`Saved: ${out}`);
    }

    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            summary: result.summary,
            comments: result.comments,
            modelUsed: result.modelUsed,
            durationMs: ms,
            memoryId: repoId,
          },
          null,
          2
        )
      );
    } else {
      console.log("=== Summary ===");
      console.log(result.summary);
      console.log("");

      if (result.comments.length === 0) {
        console.log("No issues found.");
      } else {
        console.log(`=== Comments (${result.comments.length}) ===\n`);
        for (const c of result.comments) {
          const loc = c.line ? `${c.path}:${c.line}` : c.path;
          const badge =
            c.severity === "error"
              ? "ERROR"
              : c.severity === "warning"
                ? "WARN"
                : c.severity === "suggestion"
                  ? "SUGGEST"
                  : "INFO";
          const conf =
            typeof c.confidence === "number"
              ? ` · conf ${(c.confidence * 100).toFixed(0)}%`
              : "";
          console.log(`[${badge}] ${loc} (${c.category}${conf})`);
          console.log(`  ${c.body}`);
          if (c.explanation) console.log(`  why: ${c.explanation}`);
          if (c.memoryRefs?.length) {
            console.log(`  memory: ${c.memoryRefs.join(" · ")}`);
          }
          console.log("");
        }
      }
      if (result.meta) {
        const m = result.meta;
        const bits = [
          m.durationMs != null ? `${m.durationMs}ms` : null,
          result.modelUsed,
          m.memoryItemsUsed != null ? `memory×${m.memoryItemsUsed}` : null,
          m.diffStats
            ? `files ${m.diffStats.files} (+${m.diffStats.added}/-${m.diffStats.removed})`
            : null,
          m.truncatedDiff ? "diff-truncated" : null,
        ].filter(Boolean);
        console.log(`Done · ${bits.join(" · ")}`);
      } else {
        console.log(`Done in ${ms}ms · ${result.modelUsed}`);
      }
    }

    // CI-friendly exit codes
    const failOn = (opts.failOn as string | undefined)?.toLowerCase();
    if (failOn) {
      const rank: Record<string, number> = {
        error: 0,
        warning: 1,
        suggestion: 2,
        info: 3,
      };
      const threshold = rank[failOn];
      if (threshold === undefined) {
        console.error("--fail-on must be error|warning|suggestion");
        process.exit(2);
      }
      const hit = result.comments.some(
        (c) => (rank[c.severity] ?? 99) <= threshold
      );
      if (hit) process.exit(1);
    }
  });


program
  .command("review:last")
  .description("Show the last saved review (--save)")
  .option("--json", "Raw JSON")
  .action(async (opts: { json?: boolean }) => {
    workDir();
    const { join } = await import("node:path");
    const dir = process.env.ARCHIVIST_DATA_DIR || join(process.cwd(), ".archivist");
    const path = join(dir, "last-review.json");
    if (!existsSync(path)) {
      console.error("No saved review. Run: archivist review --save");
      process.exit(1);
    }
    const data = JSON.parse(readFileSync(path, "utf-8"));
    if (opts.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    const result = data.result || data;
    console.log(`Saved at : ${data.at || "unknown"}`);
    console.log(`Memory   : ${data.memoryId || "?"}`);
    console.log(`Model    : ${result.modelUsed || "?"}\n`);
    console.log("=== Summary ===");
    console.log(result.summary || "");
    console.log("");
    const comments = result.comments || [];
    if (!comments.length) {
      console.log("No issues found.");
    } else {
      console.log(`=== Comments (${comments.length}) ===\n`);
      for (const c of comments) {
        const loc = c.line ? `${c.path}:${c.line}` : c.path;
        console.log(`[${(c.severity || "?").toUpperCase()}] ${loc}`);
        console.log(`  ${c.body}`);
        if (c.explanation) console.log(`  why: ${c.explanation}`);
        console.log("");
      }
    }
  });

program
  .command("models")
  .description("Show active model")
  .action(() => {
    if (!hasAnyModelKey()) {
      console.log("No model API key. Set OPENROUTER_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY.");
      return;
    }
    const model = createModelFromEnv();
    console.log(`Provider : ${model.name}`);
    console.log(`Model    : ${model.model}`);
  });




program
  .command("memory:list")
  .description("List all project memories in the data directory")
  .action(async () => {
    workDir();
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = process.env.ARCHIVIST_DATA_DIR || join(process.cwd(), ".archivist");
    try {
      const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
      if (!files.length) {
        console.log("No memories found in", dir);
        return;
      }
      console.log(`Memories in ${dir}\n`);
      for (const f of files) {
        try {
          const m = JSON.parse(readFileSync(join(dir, f), "utf-8"));
          console.log(
            `• ${m.repoName || f}  id=${m.repoId}  v${m.metadata?.version ?? "?"}  rules=${m.styleRules?.length ?? 0}  feedback=${m.historicalFeedback?.length ?? 0}`
          );
        } catch {
          console.log(`• ${f} (unreadable)`);
        }
      }
      console.log("");
    } catch {
      console.log("No memory directory yet. Run archivist init.");
    }
  });

program
  .command("memory:bootstrap")
  .description("Learn from merged PR review comments on a GitHub repo")
  .argument("<repo>", "owner/repo or GitHub URL")
  .option("-n, --limit <n>", "Max closed PRs to scan", "30")
  .option("-t, --token <token>", "GitHub token (or set GITHUB_TOKEN)")
  .action(async (repoArg: string, opts: { limit: string; token?: string }) => {
    workDir();
    const { owner, repo } = parseGithubRepo(repoArg);
    const targetId = `github.com/${owner}/${repo}`;
    await memoryStore.getOrCreate(targetId, `${owner}/${repo}`, targetId);

    console.log(`Bootstrapping memory from ${owner}/${repo}...`);
    console.log("(Public API works without a token; GITHUB_TOKEN raises rate limits.)\n");

    try {
      const result = await bootstrapFromGitHubApi({
        owner,
        repo,
        repoId: targetId,
        token: opts.token,
        limit: parseInt(opts.limit, 10) || 30,
      });
      console.log(`✓ PRs processed     : ${result.processed}`);
      console.log(`✓ Comments ingested : ${result.commentsIngested}`);
      console.log(`✓ Rules promoted    : ${result.promoted}`);
      console.log(`✓ Rules inferred    : ${result.inferred}`);
      const mem = await memoryStore.get(targetId);
      if (mem) {
        const q = memoryQualityScore(mem);
        console.log(`Memory quality      : ${q.score}/100 (${q.label})`);
      }
      console.log(`\nMemory id: ${targetId}`);
      console.log("Review with: archivist review --file diff.patch  (run from a checkout of that repo, or see --cwd)");
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });


program
  .command("memory:search")
  .description("Search project memory (lexical / embeddings when available)")
  .argument("<query>", "Search text")
  .option("-n, --limit <n>", "Max results", "10")
  .action(async (query: string, opts: { limit: string }) => {
    workDir();
    const { repoId } = resolveLocalRepoIdentity();
    const limit = parseInt(opts.limit, 10) || 10;
    const results = await memoryStore.search(repoId, query, limit);
    if (!results.length) {
      console.log("No matches.");
      return;
    }
    console.log(`\nSearch: "${query}" (${results.length} hits)\n`);
    for (const r of results) {
      const id = r.id ? r.id.slice(0, 8) : "--------";
      console.log(`• [${r.type}] ${id}  score=${r.score.toFixed(3)}`);
      console.log(`  ${r.content.slice(0, 200).replace(/\n/g, " ")}`);
      console.log("");
    }
  });

program
  .command("memory:learn")
  .description("Run learning pass: consolidate, promote feedback, infer rules")
  .action(async () => {
    workDir();
    const { repoId } = resolveLocalRepoIdentity();
    const memory = await memoryStore.get(repoId);
    if (!memory) {
      console.error("No memory found. Run archivist init first.");
      process.exit(1);
    }
    console.log("Running learning pass...");
    const result = await runLearningPass(repoId);
    console.log(`✓ Merged feedback: ${result.merged}`);
    console.log(`✓ Trimmed snippets: ${result.trimmed}`);
    console.log(`✓ Promoted to rules/patterns: ${result.promoted}`);
    console.log(`✓ Inferred from snippets: ${result.inferred}`);
    const updated = await memoryStore.get(repoId);
    if (updated) {
      const q = memoryQualityScore(updated);
      console.log(`Memory quality: ${q.score}/100 (${q.label})`);
    }
  });

program
  .command("memory:quality")
  .description("Score how strong project memory is")
  .action(async () => {
    workDir();
    const { repoId, repoName } = resolveLocalRepoIdentity();
    const memory = await memoryStore.get(repoId);
    if (!memory) {
      console.log(`No memory for ${repoName}. Run archivist init.`);
      process.exit(1);
    }
    const q = memoryQualityScore(memory);
    console.log(`\n${memory.repoName}`);
    console.log(`Quality: ${q.score}/100 (${q.label})\n`);
    if (q.breakdown) {
      console.log("Breakdown:");
      for (const [k, v] of Object.entries(q.breakdown)) {
        console.log(`  ${k.padEnd(14)} ${v}`);
      }
      console.log("");
    }
    if (q.tips.length) {
      console.log("Tips to improve:");
      q.tips.forEach((tip) => console.log(`  • ${tip}`));
      console.log("");
    }
  });


program
  .command("explain")
  .description("Explain how project memory relates to a topic or code snippet")
  .argument("<text>", "Topic, rule text, or code snippet")
  .option("-n, --limit <n>", "Max related items", "8")
  .action(async (text: string, opts: { limit: string }) => {
    workDir();
    const { repoId, repoName } = resolveLocalRepoIdentity();
    const memory = await memoryStore.get(repoId);
    if (!memory) {
      console.log("No memory. Run archivist init first.");
      process.exit(1);
    }
    const limit = parseInt(opts.limit, 10) || 8;
    const results = await memoryStore.search(repoId, text, limit);
    console.log(`\nExplain · ${repoName}`);
    console.log(`Query: ${text.slice(0, 120)}${text.length > 120 ? "…" : ""}\n`);

    if (!results.length) {
      console.log("No related memory items. This topic is not constrained by project memory yet.");
      console.log('Add guidance: archivist memory:add -t style -c "..."');
      return;
    }

    console.log("Related project memory:\n");
    for (const r of results) {
      console.log(`• (${r.type}, score ${r.score.toFixed(2)}) ${r.content.slice(0, 240)}`);
    }
    console.log("\nHow Archivist uses this:");
    console.log("  On review, these items are injected into the model context.");
    console.log("  Higher-score and higher-confidence rules weigh more in prompting.");
    console.log("  Comments should cite memory in their explanation when applicable.");
    console.log("");
  });

program
  .command("tui")
  .description("Interactive memory inspector")
  .action(() => {
    render(React.createElement(App));
  });


function buildMarkdownReport(
  result: {
    summary: string;
    comments: Array<{
      path: string;
      line?: number;
      body: string;
      severity: string;
      category: string;
      explanation?: string;
      confidence?: number;
    }>;
    modelUsed: string;
    meta?: Record<string, unknown>;
  },
  opts: { title?: string; memoryId: string; ms: number }
): string {
  const lines: string[] = [];
  lines.push(`# Archivist Review`);
  lines.push("");
  if (opts.title) lines.push(`**Title:** ${opts.title}`);
  lines.push(`**Memory:** \`${opts.memoryId}\``);
  lines.push(`**Model:** ${result.modelUsed}`);
  lines.push(`**Duration:** ${opts.ms}ms`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(result.summary);
  lines.push("");
  if (!result.comments.length) {
    lines.push("_No issues found._");
  } else {
    lines.push(`## Comments (${result.comments.length})`);
    lines.push("");
    for (const c of result.comments) {
      const loc = c.line ? `${c.path}:${c.line}` : c.path;
      lines.push(`### ${c.severity.toUpperCase()} · ${loc} · ${c.category}`);
      lines.push("");
      lines.push(c.body);
      if (c.explanation) lines.push(`\n_Why: ${c.explanation}_`);
      if (typeof c.confidence === "number") {
        lines.push(`\nConfidence: ${Math.round(c.confidence * 100)}%`);
      }
      lines.push("");
    }
  }
  lines.push("---");
  lines.push(`_Generated by Archivist_`);
  return lines.join("\n");
}


program.parse();
