# Deploy Archivist (GitHub App server)

## Docker Compose (recommended)

```bash
cp .env.example .env
# Set model keys + GITHUB_APP_* secrets — never commit .env

docker compose up -d --build
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

Webhook URL for the GitHub App:

```text
https://<your-public-host>/api/github/webhooks
```

### Environment checklist

| Variable | Required |
|----------|----------|
| One of `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` | yes |
| `GITHUB_APP_ID` | yes |
| `GITHUB_PRIVATE_KEY` | yes |
| `GITHUB_WEBHOOK_SECRET` | yes |
| `ARCHIVIST_PROVIDER` / `ARCHIVIST_MODEL` | recommended |
| `ARCHIVIST_BOOTSTRAP_ON_INSTALL` | no (default true) |
| `PORT` | no (default 3000) |

## Docker CLI

```bash
docker build -t archivist .
docker run --rm -p 3000:3000 --env-file .env archivist
```

## Fly.io / Railway / Render

- Build from the included `Dockerfile`
- Set the same env vars as secrets (not in the image)
- Health: `/health` · Ready: `/ready` · Metrics: `/metrics`

## Local tunnel (dev only)

```bash
npm run dev:server
cloudflared tunnel --url http://localhost:3000
```

## Operational notes

- HTTPS only in production  
- Strong `GITHUB_WEBHOOK_SECRET`  
- Prefer a stable paid model for production traffic  
- Watch `/metrics` for `reviewsFailed` and queue depth  
- Memory files live in the container filesystem unless you mount `ARCHIVIST_DATA_DIR`  

## Bootstrap on install

When the app is installed (or repos are added), Archivist scans recent merged PRs and seeds memory.

```env
ARCHIVIST_BOOTSTRAP_ON_INSTALL=false   # disable
```

## Skip a single PR

Add label `archivist:skip` or `skip-archivist`.
