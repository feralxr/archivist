# Project status — finish current surface

Last updated: 0.4.3+

## Checklist

| Item | Status |
|------|--------|
| Memory id CLI ↔ App aligned | Done (`githubRepoId`) |
| `memory:migrate` | Done |
| REQUEST_CHANGES opt-in | Done |
| Prompt profiles | Done |
| Interactive setup | Done |
| Atomic memory writes | Done |
| Core unit tests | Run locally: `npm run test:core` |
| Live eval | Run locally: `npm run eval` / `npm test` |
| npm publish `@feralxr/archivist` | Operator: `docs/NPM.md` |
| Host GitHub App | Operator: `docs/DEPLOY.md` + `fly.toml` |

## Depth priorities (current phase — no new product areas)

1. Reliability of review + memory paths
2. Learning quality (promote / infer)
3. Tests covering profiles, migrate, repo ids
4. Ship + dogfood on real repos

## Explicitly deferred

- IDE plugins
- Web dashboard
- Multi-agent orchestration beyond review
- Database-backed memory (file store is intentional for v0.4)
