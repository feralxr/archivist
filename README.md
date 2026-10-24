# Archivist

**Memory-aware code review for GitHub.**

Archivist reviews pull requests using *your* project’s style, architecture, and past human feedback — not generic AI nits.

High signal. Low noise. Gets better as your team reviews code.

## Install

```bash
git clone https://github.com/feralxr/archivist.git
cd archivist && npm install
cp .env.example .env
```

Add **any** model provider key to `.env` (at least one):

```env
# Pick one (or more)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
OPENROUTER_API_KEY=sk-or-...

# Optional: force provider + model
ARCHIVIST_PROVIDER=openai          # openrouter | anthropic | openai
ARCHIVIST_MODEL=gpt-4o-mini
```

**Local review:**

```bash
npx tsx src/cli/index.ts init
npx tsx src/cli/index.ts memory:add -t style -c "Prefer early returns"
npx tsx src/cli/index.ts review          # current git diff
npx tsx src/cli/index.ts memory:learn
npx tsx src/cli/index.ts memory:bootstrap tj/commander.js
npx tsx src/cli/index.ts memory:quality
```

**Automatic PR reviews:** [docs/GITHUB_APP.md](docs/GITHUB_APP.md)

Full install: [docs/INSTALL.md](docs/INSTALL.md)

## Model providers

Archivist is **provider-agnostic**. Use whatever keys you already have:

| Provider | Env var | Example `ARCHIVIST_MODEL` |
|----------|---------|---------------------------|
| OpenAI | `OPENAI_API_KEY` | `gpt-4o`, `gpt-4o-mini` |
| Anthropic | `ANTHROPIC_API_KEY` | `claude-sonnet-4-20250514` |
| OpenRouter | `OPENROUTER_API_KEY` | any model id on OpenRouter (including free tiers) |

If several keys are set, selection order is: `ARCHIVIST_PROVIDER` (if set) → OpenRouter → Anthropic → OpenAI.

## Why teams use it

| Generic AI review bots | Archivist |
|------------------------|-----------|
| Every PR in isolation | Persistent **project memory** |
| Noisy comment walls | Hard caps, severity discipline |
| Opaque suggestions | Memory-backed **why** explanations |
| Static | Learns from human reviews |

## How learning works

Human review comments → snippets & feedback → consolidate → promote to rules/patterns → next review uses them.

Details: [docs/LEARNING.md](docs/LEARNING.md)

## Test

```bash
npm test          # full suite (live tests if any provider key is set)
npm run test:core # no API calls
npm run eval       # golden-diff review quality (needs model key)
```

See [docs/TESTING.md](docs/TESTING.md).

## Docs

| Doc | Topic |
|-----|--------|
| [INSTALL.md](docs/INSTALL.md) | CLI + GitHub App install |
| [CLI.md](docs/CLI.md) | Local workflow |
| [GITHUB_APP.md](docs/GITHUB_APP.md) | Production app setup |
| [LEARNING.md](docs/LEARNING.md) | Learning loop |
| [TESTING.md](docs/TESTING.md) | Test suite |
| [DEPLOY.md](docs/DEPLOY.md) | Docker & production |

## Architecture

```
src/
├── review/     Review engine + prompts (signal-first)
├── github/     GitHub App, ingest, learn from humans
├── memory/     Project memory, embeddings, learning pass
├── models/     OpenAI · Anthropic · OpenRouter (pluggable)
├── cli/        Local workflow
└── server.ts   Webhooks
```

## License

MIT
