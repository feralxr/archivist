# Pipelines & flows

How data moves through Archivist.

---

## 1. Local review pipeline

```
git working tree
       │
       ▼
  getGitDiff / --file / --diff
       │
       ▼
  resolve repo identity ──► load ProjectMemory (.archivist/*.json)
       │
       ▼
  buildContext (style, architecture, patterns, feedback)
       │
       ▼
  ReviewEngine + prompts
       │
       ▼
  Model provider (OpenAI / Anthropic / OpenRouter)
       │
       ▼
  JSON parse → validate → post-process (dedupe, severity, caps)
       │
       ▼
  CLI print / --json / --fail-on exit code
```

**Commands:** `archivist review`, `archivist init`, `memory:add`, …

---

## 2. GitHub App PR pipeline

```
GitHub PR event (opened / synchronize / ready_for_review)
       │
       ▼
  Webhook → /api/github/webhooks
       │
       ▼
  Filters: draft? bot author? archivist:skip label? already reviewed SHA?
       │
       ▼
  Fetch PR diff (installation Octokit)
       │
       ▼
  Optional: ingest existing review comments on open
       │
       ▼
  ReviewEngine (same as CLI)
       │
       ├─► Inline review comments on the PR
       └─► Check Run (if Checks permission granted)
```

**Skip conditions**

- Draft PRs (until `ready_for_review`)
- Bot authors (Dependabot, etc.)
- Labels: `archivist:skip`, `skip-archivist`
- Empty / trivial diff
- Huge diff → notice comment only (~350k chars)
- Same head SHA already reviewed (in-process dedupe)

---

## 3. Learning pipeline

```
Human submits PR review
       │
       ▼
  pull_request_review.submitted
       │
       ▼
  Store raw snippets + historical feedback
       │
       ▼
  promoteFeedback (frequent → style rules / patterns)
       │
       ▼
  Next PR review includes stronger memory context
```

**Local equivalents**

```bash
archivist memory:bootstrap owner/repo   # historical PRs via API
archivist memory:learn                  # consolidate + promote + infer
archivist memory:quality
```

---

## 4. Install bootstrap pipeline

```
installation.created
installation_repositories.added
       │
       ▼
  For each repo (if ARCHIVIST_BOOTSTRAP_ON_INSTALL)
       │
       ▼
  Scan recent merged PRs → comments → snippets/feedback
       │
       ▼
  promote + infer → day-1 memory before first Archivist review
```

---

## 5. CLI bootstrap pipeline

```
archivist memory:bootstrap owner/repo
       │
       ▼
  GitHub REST API (optional GITHUB_TOKEN)
       │
       ▼
  Closed merged PRs → review comments
       │
       ▼
  Memory id: github.com/owner/repo
       │
       ▼
  promote + infer
```

Use the same id later:

```bash
archivist review --file pr.diff --memory-id github.com/owner/repo
```

---

## 6. CI pipeline (optional)

```
pull_request job
       │
       ▼
  git diff base...HEAD → file
       │
       ▼
  archivist review --file … --fail-on warning
       │
       ▼
  exit 0 / 1 → job pass / fail
```

See [CI_REVIEW.md](./CI_REVIEW.md). Prefer the **GitHub App** for inline comments; use CI when you need a hard gate without hosting the App.

---

## Server HTTP surface

| Path | Purpose |
|------|---------|
| `GET /health` | Liveness |
| `GET /ready` | App credentials + model key present |
| `GET /metrics` | In-process counters + queue stats |
| `POST /api/github/webhooks` | GitHub webhooks |

---

## Data on disk

```
.archivist/                    # or ARCHIVIST_DATA_DIR
  github.com_org_repo.json     # one file per memory id
```

Export/import via `memory:export` / `memory:import` for backup or migration.
