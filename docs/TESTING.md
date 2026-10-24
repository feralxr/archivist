# Testing

## One command

```bash
cd archivist
npm install
cp .env.example .env   # optional model key for live tests
npm test
```

| Variant | Behavior |
|---------|----------|
| `npm test` | Core + live (if any model key set) |
| `npm run test:core` | No API calls |
| `npm run test:live` | Same as `npm test` |
| `npm run typecheck` | TypeScript |
| `npm run eval` | Golden-diff review quality (needs model key) |

Without a model key, live tests **skip** (they do not fail).

## What `npm test` covers

Config, retry/queue, memory CRUD, search, consolidate, learning, identity, prompts, providers, fixtures, and optional live ReviewEngine on `fixtures/sample.diff`.

Tests write only under a **temp** data dir — your `.archivist/` is untouched.

## Eval harness

```bash
npm run eval
```

Cases live in `fixtures/eval/` (`manifest.json` + diffs). Results: `fixtures/eval/last-results.json` (gitignored).

## CI

GitHub Actions runs `typecheck` + `test:core` on every push to `main`.  
See `.github/workflows/ci.yml`.
