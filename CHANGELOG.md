# Changelog

## 0.3.3

### Deepened
- **memory:search** — query project memory with scores
- **explain** — map a topic/snippet to related memory + how it is used
- **Check runs** — findings list, meta, and line annotations

## 0.3.2

### Deepened
- **memory:edit** — update style/architecture/pattern by id
- **memory** listing shows short ids + conf/source for rm/show/edit
- **Parallel chunk reviews** (2 concurrent) for large multi-file diffs

## 0.3.1

### Deepened
- **memory:rm / memory:show** — remove or inspect items by id
- **Large-diff chunking** — multi-file diffs split into review chunks (max 4) and merged
- **Bootstrap filters** — skip LGTM / noise comments when seeding memory

## 0.3.0

### Deepened features
- **Review engine**: path validation against diff, severity ranking, noise filters, confidence scores, memoryRefs, richer meta
- **Prompts**: exhaustive memory-first system prompt with severity/category discipline
- **Memory context**: priority-ordered sections with confidence/source and relevance search
- **Learning**: stronger promote/infer heuristics + quality breakdown
- **CLI/GitHub output**: confidence, memory citations, review meta

## 0.2.2

### Added
- `archivist review --json` and `--fail-on error|warning|suggestion` for CI
- GitHub Check Runs on reviewed commits (optional Checks permission)
- docs/CI_REVIEW.md example workflow

## 0.2.1

### Added
- `npm run eval` — golden-diff review quality harness (`fixtures/eval/`)
- `ARCHIVIST_SKIP_DOCS_ONLY` — skip model calls for documentation-only PRs

## 0.2.0

### Added
- OpenAI and Anthropic providers alongside OpenRouter
- `memory:bootstrap` from GitHub API (no App required)
- Global `--cwd` and `review --memory-id` for multi-repo workflows
- Auto-bootstrap when GitHub App is installed on a repo
- Docker + docker-compose production deploy
- PR labels `archivist:skip` / `skip-archivist`
- Diff stats (docs-only detection)
- Exhaustive `npm test` suite
- CI workflow (typecheck + core tests)

### Improved
- Provider-agnostic docs and `.env.example`
- Embeddings via OpenAI or OpenRouter
- Review quality post-processing and prompts
