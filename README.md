# Archivist

**Memory-aware code review for GitHub.**

Archivist reviews diffs and pull requests using *your* project’s style, architecture, and past human feedback — not generic AI nits.

High signal. Low noise. Improves as your team reviews code.

---

## Quick start (CLI)

```bash
git clone https://github.com/feralxr/archivist.git
cd archivist
npm install
npm link                 # enables the `archivist` command
cp .env.example .env     # add a model API key (see below)
```

```bash
archivist doctor         # check config
archivist init           # create project memory for this git repo
archivist memory:add -t style -c "Prefer early returns over nested ifs"
archivist review         # review current git diff
```

That’s the daily loop: **init → teach memory → review**.

---

## Model providers

Set **at least one** key in `.env`. Never commit `.env`.

| Provider | Env var | Example model |
|----------|---------|----------------|
| OpenAI | `OPENAI_API_KEY` | `gpt-4o`, `gpt-4o-mini` |
| Anthropic | `ANTHROPIC_API_KEY` | `claude-sonnet-4-20250514` |
| OpenRouter | `OPENROUTER_API_KEY` | any OpenRouter model id |

```env
OPENAI_API_KEY=your-key-here
ARCHIVIST_PROVIDER=openai
ARCHIVIST_MODEL=gpt-4o-mini
```

If several keys are set, selection is: `ARCHIVIST_PROVIDER` (if set) → OpenRouter → Anthropic → OpenAI.

---

## Why Archivist

| Generic AI review bots | Archivist |
|------------------------|-----------|
| Every PR in isolation | Persistent **project memory** |
| Noisy comment walls | Hard caps, severity discipline |
| Opaque suggestions | Memory-backed **why** |
| Static | Learns from human reviews |

---

## Two ways to run it

### 1. Local CLI (no server)

Best for day-to-day work on your machine.

```bash
archivist review
archivist review --staged
archivist review --file changes.diff --fail-on warning
archivist memory:bootstrap owner/repo
```

Full reference: **[docs/CLI.md](docs/CLI.md)**

### 2. GitHub App (automatic PR reviews)

Install once on a repo; Archivist reviews PRs via webhooks.

Guide: **[docs/GITHUB_APP.md](docs/GITHUB_APP.md)** · Deploy: **[docs/DEPLOY.md](docs/DEPLOY.md)**

---

## Documentation

| Guide | Contents |
|-------|----------|
| **[docs/INDEX.md](docs/INDEX.md)** | Full documentation index |
| [INSTALL.md](docs/INSTALL.md) | Install, `npm link`, env setup |
| [CLI.md](docs/CLI.md) | Every CLI command & flag |
| [CONFIGURATION.md](docs/CONFIGURATION.md) | All environment variables |
| [PIPELINES.md](docs/PIPELINES.md) | End-to-end flows (local, App, learning) |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Code layout & design |
| [GITHUB_APP.md](docs/GITHUB_APP.md) | Create & install the GitHub App |
| [DEPLOY.md](docs/DEPLOY.md) | Docker & production hosting |
| [LEARNING.md](docs/LEARNING.md) | How project memory improves |
| [TESTING.md](docs/TESTING.md) | `npm test`, eval harness |
| [CI_REVIEW.md](docs/CI_REVIEW.md) | Use Archivist in GitHub Actions |
| [SECURITY.md](docs/SECURITY.md) | Secrets, tokens, redaction |
| [RELEASING.md](docs/RELEASING.md) | npm / GitHub releases (not PyPI) |

---

## Architecture (short)

```
src/
├── review/     Review engine + prompts
├── memory/     Project memory + learning
├── models/     OpenAI · Anthropic · OpenRouter
├── github/     GitHub App webhooks, checks, bootstrap
├── cli/        Local commands
└── server.ts   Webhook HTTP server
```

---

## License

MIT
