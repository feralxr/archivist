# Changelog

## 0.4.10

### Hardening
- Diff stats: lockfile/generated detection (`mostlyGenerated`)
- Optional `ARCHIVIST_SKIP_GENERATED` short-circuit
- Review meta includes `promptProfile`

## 0.4.9

### Hardening
- Shared `quality-filter` for bootstrap/ingest/learn (bots, LGTM, diffs, Archivist markers)
- Review post idempotency: skip if Archivist already reviewed the commit
- Graduated post fallback: inline review → summary review → issue comment
- Tests for quality filter

## 0.4.8

### Hardening (depth)
- Server: version/uptime on /health, timeouts, JSON 404/500
- Configurable review queue concurrency + review timeout on App path
- Memory search type/confidence boosts
- `status --json` for automation
- Tests for extractChangedLines

## 0.4.7

### Depth
- `doctor --json` for CI health gates
- Eval cases: secret-leak, null-hazard (8 golden cases)

## 0.4.6

### Depth
- Anthropic: JSON-only reinforcement + fence strip + lower temperature
- Doctor: prompt profile, data dir, node, max comments, min confidence
- Eval: pass rate, latency avg/p95, severity distribution in last-results.json
- extractJSON: tolerate trailing commas

## 0.4.5

### Hardening
- JSON `response_format` for OpenAI + OpenRouter reviews
- Diff line-map validation (±3) before inline comments
- `ARCHIVIST_MIN_CONFIDENCE` filter
- Consolidate merges duplicate style rules + patterns
- Comment body sanitization; embedding failure logs
- Fewer nested model retries (outer handlers still retry)

## 0.4.4

### Depth / finish
- Atomic-only `create()` (no non-atomic rewrite)
- Learning: promote strong single-shot directives; architecture notes from feedback
- Tests: profiles, strict vs minimal, migrateRepoIds
- docs/STATUS.md + scripts/finish-check.sh

## 0.4.3

### Finish current surface
- `memory:migrate` — rewrite/merge legacy numeric or bare ids → `github.com/owner/repo`
- `MemoryStore.listAll` for data-dir inventory

## 0.4.2

### Fixes (code review)
- **Memory id alignment**: GitHub App uses `github.com/owner/repo` (same as CLI), not numeric repo id
- **REQUEST_CHANGES** disabled by default (opt-in via `ARCHIVIST_REQUEST_CHANGES=true`)
- Prompt profile reads from parsed env as well as process.env

## 0.4.1

### Prompt profiles
- Built-in profiles: strict, balanced, security, mentor, minimal (+ custom file)
- Detailed strict system prompts per profile
- `archivist setup` asks which profile to use
- `prompt:list` / `prompt:set` / `prompt:show`
- `review --profile <id>`
- docs/PROMPTS.md

## 0.4.0

### Highlights
- **Interactive `archivist setup`** wizard writes `.env`
- **Stronger review prompts** (dogfooded signal rules)
- **`init` seeds** high-quality starter memory (disable with `ARCHIVIST_SEED_DEFAULTS=false`)
- Package renamed to **`@feralxr/archivist`** for npm publish
- **fly.toml** + Fly deploy section in DEPLOY.md
- docs/NPM.md publish guide

## 0.3.9

### Polish
- Richer `doctor`: resolved review model, memory quality, soft App checks, exit code
- `status` shows resolved provider/model
- GitHub App review path uses review-role model selection

## 0.3.8

### Model selection
- Curated catalogs per provider (`archivist models --list`)
- `--provider` / `--model` on `review`
- `ARCHIVIST_REVIEW_MODEL` for review-agent override
- docs/MODELS.md — any model id works; catalog is not a limit

## 0.3.7

### Maintenance
- Add `package-lock.json` and CI `npm ci` + cache
- Issue / PR templates, Dependabot, EditorConfig, gitattributes
- Root SECURITY.md; CI badge on README
- Align default `ARCHIVIST_MODEL` with multi-provider docs

## 0.3.6

### Webhook reliability
- Delivery-id tracking (skip successful duplicates, allow failed redeliveries)
- Handler errors propagate as 500 so GitHub retries
- Model review path uses withRetry before failing delivery
- Metrics: webhookRetries, duplicates, completed, failures + deliveryStats
- docs/WEBHOOKS.md

## 0.3.5

### Deepened
- Learn from **inline review comments** (`pull_request_review_comment.created`)
- `archivist review:last` — replay last `--save` review
- GitHub App docs: subscribe to review comment events

## 0.3.4

### Deepened
- Eval cases: SQL injection + API/UI boundary violations
- `ARCHIVIST_MAX_COMMENTS` / `ARCHIVIST_CHUNK_CONCURRENCY` config
- `review --report <path>` markdown report
- `review --save` writes `.archivist/last-review.json`

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
