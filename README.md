# Archivist

**Intelligent code review agent with deep project memory.**

Archivist learns your codebase's style, architecture decisions, and historical review patterns — then reviews pull requests with the context of a senior engineer who's been on the team for years.

Built for large codebases and the shift to agentic coding.

## Features

- **Project Memory** — style, architecture, preferred/discouraged patterns, recurring human feedback
- **Hybrid retrieval** — vector embeddings when available + strong lexical fallback
- **Learns from humans** — ingests review comments and improves over time
- **Historical bootstrap** — analyze past merged PRs to seed memory
- **Fully model-agnostic** — OpenRouter first (free models supported)
- **GitHub App** — automatic reviews on PR open / update
- **Production hardening** — retries, concurrency queue, structured logging, graceful shutdown
- **CLI + rich TUI** — setup, doctor, status, memory inspection

## Quick Start

```bash
npm install
cp .env.example .env
# Add OPENROUTER_API_KEY (free key at https://openrouter.ai)

npx tsx src/cli/index.ts setup     # full setup guide
npx tsx src/cli/index.ts doctor    # health check
npx tsx src/cli/index.ts init
npx tsx src/cli/index.ts memory:add -t style -c "Prefer early returns"
npx tsx src/cli/index.ts review --file changes.diff
npx tsx src/cli/index.ts tui       # interactive memory inspector
```

## GitHub App

```bash
npx tsx src/cli/index.ts setup
npm run dev:server
```

Permissions: Pull requests (R/W), Contents (R), Metadata (R)  
Events: `pull_request`, `pull_request_review`

## CLI Commands

| Command | Description |
|---------|-------------|
| `setup` | Setup guide for OpenRouter + GitHub App |
| `doctor` | Configuration health check |
| `status` | Config + memory summary |
| `init` | Create local project memory |
| `memory` | Inspect memory |
| `memory:add` | Add style / architecture / patterns |
| `review` | Review a diff file |
| `models` | Show active model |
| `tui` | Interactive memory TUI |

## Architecture

```
src/
├── cli/           CLI + rich TUI
├── core/          Config, logger, retry, queue
├── memory/        Project memory + embeddings + hybrid search
├── models/        OpenRouter provider (pluggable)
├── review/        Review engine + prompts
├── github/        GitHub App, handlers, ingest, learn, comments
└── server.ts      Webhook server (health, ready, graceful shutdown)
```

## Status

- [x] P0 — GitHub App installable, end-to-end review path
- [x] P1 — Hybrid memory, historical bootstrap, learn from humans
- [x] P2 — Retries, concurrency queue, logging, doctor/status, hardening
- [x] P3 — Richer multi-tab TUI

## License

MIT
