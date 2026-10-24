# Architecture

## Goals

1. **Project memory** as the differentiator (not another generic LLM wrapper)
2. **Provider-agnostic** models (OpenAI, Anthropic, OpenRouter)
3. **High-signal reviews** (caps, severity, memory-backed explanations)
4. **Two surfaces**: local CLI and GitHub App, sharing the same engine

## Package layout

```
bin/archivist.js          # PATH entry (dist or tsx fallback)
src/
  cli/                    # Commander CLI + Ink TUI
  core/                   # config, logger, retry, queue, metrics, types
  memory/                 # store, identity, learn, bootstrap, embeddings
  models/                 # openrouter, openai, anthropic, provider factory
  review/                 # engine, prompts, diff-stats
  github/                 # app, handlers, comments, checks, ingest, learn, install
  server.ts               # HTTP server for webhooks
scripts/
  test-all.ts             # exhaustive tests
  eval.ts                 # golden-diff quality eval
fixtures/                 # sample diffs + eval cases
docs/                     # you are here
```

## Core abstractions

### `ReviewModel`

```ts
review({ diff, memoryContext, systemInstructions }): Promise<string>
```

Implemented by each provider. Factory: `createModelFromEnv()`.

### `MemoryStore`

CRUD for `ProjectMemory`: style rules, architecture notes, patterns, historical feedback, raw snippets. Atomic writes under the data directory. Optional embeddings when an OpenAI/OpenRouter key supports them; otherwise lexical search.

### `ReviewEngine`

1. Analyze diff (docs-only detection, sizes)
2. Build memory context
3. Call model with system + user prompts
4. Parse JSON, validate schema, post-process (dedupe, noise filter, max comments)

### GitHub App

- `@octokit/app` webhooks
- Installation Octokit for diff + comments + checks
- In-process queue + SHA dedupe
- Soft-fail check runs if Checks permission missing

## Design constraints

- Default path should work with **any** of the three provider keys
- Free/shared models may rate-limit — retry with backoff
- Never log secrets (logger redaction)
- Review quality > coverage: fewer, better comments

## Extension points

| Add… | Where |
|------|--------|
| New LLM provider | `src/models/<name>.ts` + `provider.ts` switch |
| New memory field | `src/memory/types.ts` + store + prompts |
| New webhook | `src/github/app.ts` + handler module |
