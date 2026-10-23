#!/usr/bin/env node
import { Command } from "commander";
import { render } from "ink";
import React from "react";
import { readFileSync, existsSync } from "node:fs";
import { App } from "./ui/App.js";
import { createModelFromEnv } from "../models/provider.js";
import { hasOpenRouter } from "../core/config.js";
import { memoryStore } from "../memory/store.js";
import { ReviewEngine } from "../review/engine.js";

const program = new Command();

program
  .name("archivist")
  .description("Intelligent code review agent with deep project memory")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize Archivist memory for this repository")
  .option("-n, --name <name>", "Repository name")
  .action(async (opts) => {
    const repoId = process.cwd();
    const repoName = opts.name || repoId.split(/[\\/]/).pop() || "unknown";

    const existing = await memoryStore.get(repoId);
    if (existing) {
      console.log(`Memory already exists for: ${existing.repoName}`);
      console.log(
        `Version: ${existing.metadata.version} | PRs analyzed: ${existing.metadata.prsAnalyzed}`
      );
      return;
    }

    const memory = await memoryStore.create(repoId, repoName);
    console.log(`✓ Created project memory for: ${memory.repoName}`);
    console.log(`  Data stored in .archivist/`);
  });

program
  .command("memory")
  .description("Inspect project memory")
  .option("--json", "Output raw JSON")
  .action(async (opts) => {
    const repoId = process.cwd();
    const memory = await memoryStore.get(repoId);

    if (!memory) {
      console.log("No memory found. Run `archivist init` first.");
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify(memory, null, 2));
      return;
    }

    console.log(`\nRepository : ${memory.repoName}`);
    console.log(`Updated    : ${memory.metadata.updatedAt}`);
    console.log(`Version    : ${memory.metadata.version}`);
    console.log(`PRs seen   : ${memory.metadata.prsAnalyzed}`);
    console.log("");
    console.log(`Style rules        : ${memory.styleRules.length}`);
    console.log(`Architecture notes : ${memory.architectureNotes.length}`);
    console.log(`Patterns           : ${memory.patterns.length}`);
    console.log(`Historical feedback: ${memory.historicalFeedback.length}`);
    console.log(`Raw snippets       : ${memory.rawReviewSnippets.length}`);

    if (memory.styleRules.length) {
      console.log("\n--- Style Rules ---");
      memory.styleRules.slice(0, 10).forEach((r) => console.log(`• ${r.rule}`));
    }
    if (memory.architectureNotes.length) {
      console.log("\n--- Architecture ---");
      memory.architectureNotes
        .slice(0, 8)
        .forEach((n) => console.log(`• ${n.note}`));
    }
    if (memory.patterns.length) {
      console.log("\n--- Patterns ---");
      memory.patterns.slice(0, 10).forEach((p) => {
        const tag = p.preferred ? "preferred" : "discouraged";
        console.log(`• [${tag}] ${p.description}`);
      });
    }
  });

program
  .command("memory:add")
  .description("Manually add knowledge to project memory")
  .requiredOption(
    "-t, --type <type>",
    "style | architecture | preferred | discouraged"
  )
  .requiredOption("-c, --content <content>", "The rule or note")
  .action(async (opts) => {
    const repoId = process.cwd();
    await memoryStore.getOrCreate(
      repoId,
      repoId.split(/[\\/]/).pop() || "repo"
    );

    const content = opts.content;

    switch (opts.type) {
      case "style":
        await memoryStore.addStyleRule(repoId, {
          rule: content,
          source: "manual",
          confidence: 1,
        });
        break;
      case "architecture":
        await memoryStore.addArchitectureNote(repoId, { note: content });
        break;
      case "preferred":
        await memoryStore.addPattern(repoId, {
          description: content,
          preferred: true,
        });
        break;
      case "discouraged":
        await memoryStore.addPattern(repoId, {
          description: content,
          preferred: false,
        });
        break;
      default:
        console.error(
          "Type must be: style | architecture | preferred | discouraged"
        );
        process.exit(1);
    }

    console.log(`✓ Added ${opts.type} to memory`);
  });

program
  .command("review")
  .description("Review a diff using project memory")
  .option("-f, --file <path>", "Path to a diff file")
  .option("-d, --diff <diff>", "Raw diff string")
  .option("--title <title>", "PR title")
  .action(async (opts) => {
    if (!hasOpenRouter()) {
      console.error(
        "No OPENROUTER_API_KEY found.\nGet a free key at https://openrouter.ai"
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
      console.error("Provide a diff with --file or --diff");
      process.exit(1);
    }

    const repoId = process.cwd();
    await memoryStore.getOrCreate(
      repoId,
      repoId.split(/[\\/]/).pop() || "repo"
    );

    const model = createModelFromEnv();
    const engine = new ReviewEngine(model);

    console.log(`\nModel : ${model.name} / ${model.model}`);
    console.log("Reviewing...\n");

    const result = await engine.review({
      repoId,
      diff,
      title: opts.title,
    });

    console.log("=== Summary ===");
    console.log(result.summary);
    console.log("");

    if (result.comments.length === 0) {
      console.log("No issues found.");
    } else {
      console.log(`=== Comments (${result.comments.length}) ===\n`);
      for (const c of result.comments) {
        const loc = c.line ? `${c.path}:${c.line}` : c.path;
        console.log(`[${c.severity.toUpperCase()}] ${loc} (${c.category})`);
        console.log(`  ${c.body}`);
        if (c.explanation) console.log(`  → ${c.explanation}`);
        console.log("");
      }
    }
  });

program
  .command("models")
  .description("Show current model configuration")
  .action(async () => {
    if (!hasOpenRouter()) {
      console.log("No OpenRouter API key configured.");
      console.log("Set OPENROUTER_API_KEY in .env");
      return;
    }
    const model = createModelFromEnv();
    console.log(`Provider : ${model.name}`);
    console.log(`Model    : ${model.model}`);
  });

program
  .command("tui")
  .description("Launch the interactive TUI")
  .action(() => {
    render(React.createElement(App));
  });

program.parse();
