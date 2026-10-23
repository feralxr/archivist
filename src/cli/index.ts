#!/usr/bin/env node
import { Command } from "commander";
import { render } from "ink";
import React from "react";
import { App } from "./ui/App.js";
import { createModelFromEnv } from "../models/provider.js";
import { hasOpenRouter } from "../core/config.js";

const program = new Command();

program
  .name("archivist")
  .description("Intelligent code review agent with deep project memory")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize Archivist in the current repository")
  .action(async () => {
    console.log("Archivist init — coming soon");
  });

program
  .command("memory")
  .description("Inspect or manage project memory")
  .action(async () => {
    console.log("Archivist memory — coming soon");
  });

program
  .command("review")
  .description("Manually trigger a review (experimental)")
  .argument("[pr]", "PR number or URL")
  .option("-m, --model <model>", "Override model")
  .action(async (pr, options) => {
    if (!hasOpenRouter()) {
      console.error(
        "No OPENROUTER_API_KEY found.\n" +
          "Get a free key at https://openrouter.ai and add it to your .env"
      );
      process.exit(1);
    }

    try {
      const model = createModelFromEnv();
      console.log(`Using model: ${model.name} / ${model.model}`);
      console.log("Review command is still experimental. Full pipeline coming next.");
      if (pr) console.log("Target PR:", pr);
      if (options.model) console.log("Requested model override:", options.model);
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program
  .command("models")
  .description("Show current model configuration")
  .action(async () => {
    if (!hasOpenRouter()) {
      console.log("No OpenRouter API key configured.");
      console.log("Set OPENROUTER_API_KEY in .env to use free or paid models.");
      return;
    }

    try {
      const model = createModelFromEnv();
      console.log("Active provider:", model.name);
      console.log("Active model:   ", model.model);
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
    }
  });

program
  .command("tui")
  .description("Launch the interactive TUI")
  .action(() => {
    render(React.createElement(App));
  });

program.parse();
