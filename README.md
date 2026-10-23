# Archivist

**Memory-aware code review for GitHub.**

Archivist reviews pull requests using *your* project’s style, architecture, and past human feedback — not generic AI nits.

High signal. Low noise. Gets better as your team reviews code.

## Install

```bash
git clone https://github.com/feralxr/archivist.git
cd archivist && npm install
cp .env.example .env   # add OPENROUTER_API_KEY
```

**Local review (now):**

```bash
npx tsx src/cli/index.ts init
npx tsx src/cli/index.ts memory:add -t style -c "Prefer early returns"
npx tsx src/cli/index.ts review          # current git diff
npx tsx src/cli/index.ts memory:learn    # improve memory from evidence
npx tsx src/cli/index.ts memory:quality
```

**Automatic PR reviews:** [docs/GITHUB_APP.md](docs/GITHUB_APP.md)

Full install paths: [docs/INSTALL.md](docs/INSTALL.md)

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
npm test          # exhaustive suite (live tests if OPENROUTER_API_KEY set)
npm run test:core # no API calls
```

See [docs/TESTING.md](docs/TESTING.md).

## Docs

| Doc | Topic |
|-----|--------|
| [INSTALL.md](docs/INSTALL.md) | CLI + GitHub App install |
| [CLI.md](docs/CLI.md) | Local workflow |
| [GITHUB_APP.md](docs/GITHUB_APP.md) | Production app setup |
| [LEARNING.md](docs/LEARNING.md) | Learning loop |

## Architecture

```
src/
├── review/     Review engine + prompts (signal-first)
├── github/     GitHub App, ingest, learn from humans
├── memory/     Project memory, embeddings, learning pass
├── models/     OpenRouter (pluggable)
├── cli/        Local workflow
└── server.ts   Webhooks
```

## License

MIT
