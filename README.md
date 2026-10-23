# Archivist

**Intelligent code review agent with deep project memory.**

Archivist learns your codebase's style, architecture decisions, and historical review patterns — then reviews pull requests with the context of a senior engineer who's been on the team for years.

Built for large codebases and the shift to agentic coding.

## What it does

Most AI review tools treat every PR in isolation.  
Archivist builds and maintains a living **project memory**:

- Style rules actually used in the repo  
- Architecture decisions and constraints  
- Preferred vs discouraged patterns  
- Recurring human review feedback  

This memory powers high-signal, low-noise reviews.

## Current Status

Core systems are implemented:

- [x] Project memory system (local, expandable to Postgres + vectors)
- [x] Fully model-agnostic layer (OpenRouter first — free models supported)
- [x] Review engine with structured output
- [x] CLI + TUI
- [x] GitHub App foundation (webhooks, PR handling, comment posting)
- [x] PR ingestion + historical bootstrap scaffolding
- [ ] Production hardening & vector search
- [ ] Public GitHub App listing

## Quick Start (CLI)

```bash
# Install deps
npm install

# Copy env and add your OpenRouter key (free models available)
cp .env.example .env

# Initialize memory for the current repo
npx tsx src/cli/index.ts init

# Add knowledge
npx tsx src/cli/index.ts memory:add -t style -c "Prefer early returns over nested conditionals"
npx tsx src/cli/index.ts memory:add -t preferred -c "Use Zod for all external input validation"

# Review a diff
npx tsx src/cli/index.ts review --file changes.diff

# Inspect memory
npx tsx src/cli/index.ts memory
```

## GitHub App

```bash
# Start the webhook server
npm run dev:server
```

You will need:
- A GitHub App (with Pull Requests + Webhooks permissions)
- `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET` in `.env`

## Architecture

```
src/
├── cli/            # CLI + TUI
├── core/           # Shared types & config
├── memory/         # Project memory system
├── models/         # Model providers (OpenRouter first)
├── review/         # Review engine + prompts
├── github/         # GitHub App, handlers, ingestion, comments
└── server.ts       # Webhook server entrypoint
```

## Design Goals

- Memory is the product, not the model
- Extremely high signal / low noise
- Built for large codebases
- Fully pluggable models
- Clean path to becoming infrastructure for agentic coding workflows

## License

MIT
