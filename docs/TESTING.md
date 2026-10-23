# Testing Archivist

One command. Exhaustive. End-to-end.

## Quick start

```bash
git clone https://github.com/feralxr/archivist.git
cd archivist
npm install
cp .env.example .env
# Add: OPENROUTER_API_KEY=sk-or-...

npm test
```

That runs **everything**:

| Group | What it covers |
|-------|----------------|
| config | Env loading, flags |
| core | Retry, concurrency queue |
| memory | CRUD, search, context, consolidate, export/import, learning |
| identity | Git remote identity, git diff |
| review | Prompts, truncation, cosine |
| models | Provider factory |
| live | Real OpenRouter calls + full ReviewEngine on `fixtures/sample.diff` |
| fixtures | Sample files present and valid |

## Variants

```bash
npm test              # core + live (if key set)
npm run test:core     # core only, no API calls
npm run test:live     # same as npm test
npm run typecheck     # TypeScript
```

Without `OPENROUTER_API_KEY`, live tests are **skipped** (not failed).

## Exit codes

- `0` — all executable tests passed  
- `1` — at least one failure  

## Fixtures

- `fixtures/sample.diff` — realistic PR-style diff  
- `fixtures/sample-memory.json` — sample project memory  

## Notes

- Tests write memory only under a temp directory (never touches your `.archivist/`)
- Free OpenRouter models can rate-limit; re-run if a live test fails with 429
- Recommended model: `ARCHIVIST_MODEL=recursive/flint-v1.0:free`
