# Archivist

**Memory-aware code review for GitHub.**

Archivist reviews pull requests with knowledge of *your* codebase — style, architecture, and what human reviewers have actually asked for before. High signal. Low noise.

## Product focus

Industry-level depth on two things:

1. **Review quality** — staff-engineer signal, not linter spam  
2. **GitHub App** — install once, automatic reviews on every PR  

Everything else (CLI, TUI, local memory tools) supports that product.

## Why it is different

Most AI review bots treat every PR in isolation.  
Archivist maintains **project memory**:

- Style rules the team actually follows  
- Architecture constraints  
- Preferred vs discouraged patterns  
- Recurring human review feedback  

Comments that come from memory include a short **why** so the feedback is explainable.

## Quick start (GitHub App)

See **[docs/GITHUB_APP.md](docs/GITHUB_APP.md)** for the full install path.

```bash
npm install
cp .env.example .env
# Set OPENROUTER_API_KEY + GitHub App credentials

npm run dev:server
# Expose with cloudflared/ngrok and install the app on a repo
```

## CLI (supporting tools)

```bash
npx tsx src/cli/index.ts setup
npx tsx src/cli/index.ts doctor
npx tsx src/cli/index.ts init
npx tsx src/cli/index.ts memory:add -t style -c "Prefer early returns"
npx tsx src/cli/index.ts review --file changes.diff
```

## Review quality standards

- Prefer **0–5** strong comments over noisy walls of text  
- Empty comment list is a valid outcome for clean PRs  
- Severity discipline: error / warning / suggestion / info  
- Memory-backed comments carry an explanation  
- Bot PRs skipped · draft PRs skipped · huge diffs get a notice · same commit not reviewed twice  

## Architecture

```
src/
├── review/     # Industry-level prompts + engine + post-processing
├── github/     # GitHub App, handlers, comments, ingest, learn
├── memory/     # Project memory (supports the review)
├── models/     # OpenRouter (pluggable)
├── core/       # Config, retry, queue, logging
├── cli/        # Setup, doctor, local review helpers
└── server.ts   # Webhook server
```

## License

MIT
