# Deploy Archivist

## Docker (recommended)

```bash
cp .env.example .env
# fill model keys + GitHub App credentials

docker compose up -d --build
curl http://localhost:3000/health
```

Point the GitHub App webhook at:

```text
https://<your-domain>/api/github/webhooks
```

### Environment

| Variable | Required | Notes |
|----------|----------|--------|
| Model key | yes | `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` and/or `OPENROUTER_API_KEY` |
| `ARCHIVIST_PROVIDER` | no | Force `openai` \| `anthropic` \| `openrouter` |
| `ARCHIVIST_MODEL` | no | Provider-specific model id |
| `GITHUB_APP_ID` | yes (app) | |
| `GITHUB_PRIVATE_KEY` | yes (app) | PEM; use `\n` for newlines in env |
| `GITHUB_WEBHOOK_SECRET` | yes (app) | |
| `ARCHIVIST_BOOTSTRAP_ON_INSTALL` | no | Default `true` — seed memory when installed on a repo |
| `PORT` | no | Default `3000` |

## Fly.io / Railway / Render

Build from the included `Dockerfile`. Set the same env vars as above.  
Health check path: `/health`  
Ready check: `/ready`

## Local tunnel

```bash
npm run dev:server
cloudflared tunnel --url http://localhost:3000
```

## Install bootstrap

When the GitHub App is installed on a repository (or repos are added), Archivist:

1. Creates project memory for that repo  
2. Scans recent merged PRs  
3. Ingests human review comments  
4. Promotes / infers durable rules  

Disable with:

```env
ARCHIVIST_BOOTSTRAP_ON_INSTALL=false
```

## Skip a PR

Add label `archivist:skip` or `skip-archivist` on the pull request.
