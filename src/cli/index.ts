#!/usr/bin/env node
import { Command } from "commander";
import { render } from "ink";
import React from "react";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { App } from "./ui/App.js";
import { createModelFromEnv } from "../models/provider.js";
import { hasOpenRouter, hasGitHubApp, env } from "../core/config.js";
import { memoryStore } from "../memory/store.js";
import { ReviewEngine } from "../review/engine.js";
import { resolveLocalRepoIdentity, getGitDiff } from "../memory/identity.js";
import { runLearningPass, memoryQualityScore } from "../memory/learn.js";

const program = new Command();

program
  .name("archivist")
  .description("Memory-aware code review — local CLI and GitHub App")
  .version("0.1.0");

// ── Setup / health ──────────────────────────────────────────

program
  .command("setup")
  .description("Show setup instructions")
  .action(() => {
    console.log(`
Archivist setup
───────────────
1. OpenRouter key → https://openrouter.ai (free models available)
   OPENROUTER_API_KEY=...
   ARCHIVIST_MODEL=recursive/flint-v1.0:free

2. Local workflow
   archivist init
   archivist memory:add -t style -c "Prefer early returns"
   archivist review              # reviews current git diff
   archivist review --staged
   archivist review --file changes.diff

3. GitHub App (automatic PR reviews)
   See docs/GITHUB_APP.md

Status: OpenRouter ${hasOpenRouter() ? "✓" : "✗"}  GitHub App ${hasGitHubApp() ? "✓" : "✗"}  Model ${env.ARCHIVIST_MODEL}
`);
  });

program
  .command("doctor")
  .description("Check configuration health")
  .action(async () => {
    console.log("\nArchivist Doctor\n");
    const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

    checks.push({
      name: "OpenRouter API key",
      ok: hasOpenRouter(),
      detail: hasOpenRouter() ? "set" : "missing — local review needs this",
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

    if (hasOpenRouter()) {
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
    const { repoId, repoName, remoteUrl } = resolveLocalRepoIdentity();
    console.log("\nConfiguration");
    console.log(`  OpenRouter : ${hasOpenRouter() ? "yes" : "no"}`);
    console.log(`  GitHub App : ${hasGitHubApp() ? "yes" : "no"}`);
    console.log(`  Model      : ${env.ARCHIVIST_MODEL}`);
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
    const { repoId } = resolveLocalRepoIdentity();
    const memory = await memoryStore.get(repoId);

    if (!memory) {
      console.log("No memory found. Run `archivist init` first.");
      return;
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

    if (memory.styleRules.length) {
      console.log("\n--- Style ---");
      memory.styleRules.slice(0, 12).forEach((r) => console.log(`• ${r.rule}`));
    }
    if (memory.architectureNotes.length) {
      console.log("\n--- Architecture ---");
      memory.architectureNotes.slice(0, 8).forEach((n) => console.log(`• ${n.note}`));
    }
    if (memory.patterns.length) {
      console.log("\n--- Patterns ---");
      memory.patterns.slice(0, 12).forEach((p) => {
        console.log(`• [${p.preferred ? "preferred" : "discouraged"}] ${p.description}`);
      });
    }
    if (memory.historicalFeedback.length) {
      console.log("\n--- Recurring feedback ---");
      memory.historicalFeedback
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 10)
        .forEach((f) => console.log(`• (${f.frequency}×) ${f.summary.slice(0, 120)}`));
    }
    console.log("");
  });

program
  .command("memory:add")
  .description("Add knowledge to project memory")
  .requiredOption("-t, --type <type>", "style | architecture | preferred | discouraged")
  .requiredOption("-c, --content <content>", "The rule or note")
  .action(async (opts) => {
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
  .action(async (opts) => {
    if (!hasOpenRouter()) {
      console.error(
        "No OPENROUTER_API_KEY.\nGet a free key at https://openrouter.ai and set it in .env"
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
      diff = getGitDiff(process.cwd(), mode);
      if (!diff || diff.trim().length < 5) {
        console.error(
          "No diff found. Commit status is clean, or pass --file / --diff."
        );
        process.exit(1);
      }
      console.log(`Using git diff (${mode}) · ${diff.length} chars`);
    }

    const { repoId, repoName, remoteUrl } = resolveLocalRepoIdentity();
    await memoryStore.getOrCreate(repoId, repoName, remoteUrl);

    const model = createModelFromEnv();
    const engine = new ReviewEngine(model);

    console.log(`Model : ${model.name} / ${model.model}`);
    console.log("Reviewing...\n");

    const started = Date.now();
    const result = await engine.review({
      repoId,
      diff,
      title: opts.title,
    });
    const ms = Date.now() - started;

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
        console.log(`[${badge}] ${loc} (${c.category})`);
        console.log(`  ${c.body}`);
        if (c.explanation) console.log(`  why: ${c.explanation}`);
        console.log("");
      }
    }
    console.log(`Done in ${ms}ms · ${result.modelUsed}`);
  });

program
  .command("models")
  .description("Show active model")
  .action(() => {
    if (!hasOpenRouter()) {
      console.log("No OpenRouter API key. Set OPENROUTER_API_KEY in .env");
      return;
    }
    const model = createModelFromEnv();
    console.log(`Provider : ${model.name}`);
    console.log(`Model    : ${model.model}`);
  });


program
  .command("memory:learn")
  .description("Run learning pass: consolidate, promote feedback, infer rules")
  .action(async () => {
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
    const { repoId, repoName } = resolveLocalRepoIdentity();
    const memory = await memoryStore.get(repoId);
    if (!memory) {
      console.log(`No memory for ${repoName}. Run archivist init.`);
      process.exit(1);
    }
    const q = memoryQualityScore(memory);
    console.log(`\n${memory.repoName}`);
    console.log(`Quality: ${q.score}/100 (${q.label})\n`);
    if (q.tips.length) {
      console.log("Tips to improve:");
      q.tips.forEach((t) => console.log(`  • ${t}`));
      console.log("");
    }
  });

program
  .command("tui")
  .description("Interactive memory inspector")
  .action(() => {
    render(React.createElement(App));
  });

program.parse();
