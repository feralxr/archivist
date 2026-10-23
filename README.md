# Archivist

**Intelligent code review agent with deep project memory.**

Archivist learns your codebase's style, architecture decisions, and historical review patterns — then reviews pull requests with the context of a senior engineer who's been on the team for years.

Built for large codebases and the shift to agentic coding.

## Features

- **Project Memory** — style rules, architecture notes, preferred/discouraged patterns, recurring human feedback
- **Hybrid retrieval** — vector embeddings when available, strong lexical fallback
- **Learns from humans** — ingests review comments and improves over time
- **Historical bootstrap** — can analyze past merged PRs to seed memory
- **Fully model-agnostic** — OpenRouter first (free models supported)
- **GitHub App** — automatic reviews on PR open / update
- **CLI + TUI** — local control and inspection

## Quick Start

```bash
npm install
cp .env.example .env
# Add OPENROUTER_API_KEY (get free key at https://openrouter.ai)

npx tsx src/cli/index.ts setup          # full setup guide
npx tsx src/cli/index.ts init
npx tsx src/cli/index.ts memory:add -t style -c "Prefer early returns"
npx tsx src/cli/index.ts review --file changes.diff
```

## GitHub App

```bash
npx tsx src/cli/index.ts setup   # detailed instructions
npm run dev:server               # start webhook server
```

Required permissions: Pull requests (R/W), Contents (R), Metadata (R)  
Events: `pull_request`, `pull_request_review`

## Architecture

```
src/
├── cli/           CLI + TUI
├── core/          Config & types
├── memory/        Project memory + embeddings + hybrid search
├── models/        OpenRouter provider (pluggable)
├── review/        Review engine + prompts
├── github/        GitHub App, handlers, ingest, learn, comments
└── server.ts      Webhook server
```

## Status

P0 and P1 complete:
- [x] Installable GitHub App foundation
- [x] Secrets / config handling
- [x] End-to-end review path
- [x] Hybrid memory search (vector + lexical)
- [x] Historical bootstrap
- [x] Learning from human reviews

## License

MIT
