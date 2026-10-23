#!/usr/bin/env node
import { Command } from "commander";
import { render } from "ink";
import React from "react";
import { App } from "./ui/App.js";

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
  .description("Manually trigger a review")
  .argument("[pr]", "PR number or URL")
  .action(async (pr) => {
    console.log("Archivist review — coming soon", pr ?? "");
  });

program
  .command("tui")
  .description("Launch the interactive TUI")
  .action(() => {
    render(React.createElement(App));
  });

// Default: show help or launch TUI later
program.parse();
