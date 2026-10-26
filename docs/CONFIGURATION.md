# Configuration reference

All settings are environment variables. Load order: process env, then `.env` in the current working directory (via `dotenv`).

**Never commit real keys.** Use `.env` locally and your host’s secret store in production.

## Model providers

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | one of three | OpenAI API key |
| `ANTHROPIC_API_KEY` | one of three | Anthropic API key |
| `OPENROUTER_API_KEY` | one of three | OpenRouter API key |
| `ARCHIVIST_PROVIDER` | no | Force `openai` \| `anthropic` \| `openrouter` |
| `ARCHIVIST_MODEL` | no | Default model id for the chosen provider |
| `ARCHIVIST_REVIEW_MODEL` | no | Model id for **review agent only** (overrides `ARCHIVIST_MODEL`) |
| `ARCHIVIST_EMBEDDING_MODEL` | no | Embedding model id (OpenAI or OpenRouter-style) |

**Selection order** when `ARCHIVIST_PROVIDER` is unset:

1. OpenRouter (if key present)  
2. Anthropic  
3. OpenAI  

### Example models

```env
# OpenAI
ARCHIVIST_PROVIDER=openai
ARCHIVIST_MODEL=gpt-4o-mini

# Anthropic
ARCHIVIST_PROVIDER=anthropic
ARCHIVIST_MODEL=claude-sonnet-4-20250514

# OpenRouter (any catalog id, including free-tier models)
ARCHIVIST_PROVIDER=openrouter
ARCHIVIST_MODEL=recursive/flint-v1.0:free
```

## GitHub App (server)

| Variable | Required for App | Description |
|----------|------------------|-------------|
| `GITHUB_APP_ID` | yes | Numeric app id |
| `GITHUB_PRIVATE_KEY` | yes | PEM private key (`\n` for newlines in env) |
| `GITHUB_WEBHOOK_SECRET` | yes | Webhook secret |
| `GITHUB_CLIENT_ID` | no | OAuth (future) |
| `GITHUB_CLIENT_SECRET` | no | OAuth (future) |

## GitHub API (CLI bootstrap)

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` or `GH_TOKEN` | no | PAT for `memory:bootstrap` rate limits / private repos |

Scopes for a PAT used only for bootstrap: public `repo` read is enough for public repos; private repos need appropriate repo access.

## Behavior flags

| Variable | Default | Description |
|----------|---------|-------------|
| `ARCHIVIST_BOOTSTRAP_ON_INSTALL` | `true` | Seed memory when the App is installed on a repo |
| `ARCHIVIST_SKIP_DOCS_ONLY` | unset | If `true`/`1`, skip model review for docs-only diffs |
| `ARCHIVIST_MAX_COMMENTS` | `8` | Max comments after post-processing (1–20) |
| `ARCHIVIST_CHUNK_CONCURRENCY` | `2` | Parallel chunk reviews for large diffs (1–4) |
| `ARCHIVIST_DATA_DIR` | `./.archivist` | Where memory JSON files are stored |
| `PORT` | `3000` | HTTP port for the App server |
| `NODE_ENV` | `development` | `development` \| `production` \| `test` |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |

## Testing only

| Variable | Description |
|----------|-------------|
| `ARCHIVIST_SKIP_LIVE` | If `1`, `npm test` skips live model calls |

## Security notes

- Logs **redact** values that look like `sk-…`, `ghp_…`, `github_pat_…`, and keys named `*token*`, `*secret*`, etc.
- Prefer host secrets (GitHub Actions secrets, Fly secrets, Doppler) over baking keys into images.
- Rotate any token that was ever pasted into chat, screenshots, or git remotes.

See [SECURITY.md](./SECURITY.md).

| `ARCHIVIST_REVIEW_CONCURRENCY` | `2` | Max concurrent PR reviews in the App server |
| `ARCHIVIST_REVIEW_TIMEOUT_MS` | `180000` | Abort a single review after this many ms |
