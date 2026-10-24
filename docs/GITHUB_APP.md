# GitHub App setup

This is the product path: install once, get memory-aware reviews on every PR.

## 1. Create the GitHub App

1. Open https://github.com/settings/apps/new  
   (or **Organization settings → Developer settings → GitHub Apps**)

2. **Identity**
   - Name: `Archivist` (or `Archivist for <org>`)
   - Homepage: `https://github.com/feralxr/archivist`
   - Webhook URL: `https://<your-host>/api/github/webhooks`
   - Webhook secret: long random string (save it)

3. **Repository permissions**
   - Pull requests: **Read & write**
   - Contents: **Read-only**
   - Metadata: **Read-only**
   - Checks: **Read & write** (optional — enables check runs)

4. **Subscribe to events**
   - Pull request  
   - Pull request review  
   - Installation  
   - Installation repositories  

5. Create the app → **Generate a private key** (download `.pem`) → copy **App ID**.

## 2. Environment

```bash
cp .env.example .env
```

```env
# Model (any supported provider)
OPENAI_API_KEY=
ARCHIVIST_PROVIDER=openai
ARCHIVIST_MODEL=gpt-4o-mini

# GitHub App
GITHUB_APP_ID=123456
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your_webhook_secret

PORT=3000
ARCHIVIST_BOOTSTRAP_ON_INSTALL=true
```

Store secrets in the host’s secret manager when deploying. Never commit the PEM or webhook secret.

## 3. Run the server

Local:

```bash
npm install
npm run dev:server
```

Tunnel for webhooks:

```bash
cloudflared tunnel --url http://localhost:3000
# or: ngrok http 3000
```

Set the GitHub App webhook URL to `https://<tunnel>/api/github/webhooks`.

Production: [DEPLOY.md](./DEPLOY.md).

## 4. Install on a repository

App page → **Install App** → choose account → select repos → confirm.

On install, Archivist **bootstraps memory** from recent merged PRs (unless `ARCHIVIST_BOOTSTRAP_ON_INSTALL=false`).

## 5. Verify

1. Open a non-draft PR  
2. Within about a minute: review comments and/or an **Archivist** check  
3. `GET /health` and `GET /ready`  
4. `GET /metrics` for counters  

## Event behavior

| Event | Behavior |
|-------|----------|
| PR opened | Review + light comment ingest |
| PR synchronize | Re-review (deduped per head SHA) |
| ready_for_review | Review |
| Human review submitted | Learn into memory |
| Installation / repos added | Bootstrap memory |
| Bot PRs | Skipped |
| Label `archivist:skip` | Skipped |

## Troubleshooting

| Symptom | Check |
|---------|--------|
| No reviews | `/ready`, model key, webhook deliveries in GitHub App settings |
| 401/403 from GitHub | App permissions, installation on that repo |
| No check run | Grant Checks: Read & write; non-fatal if missing |
| Empty memory | Bootstrap logs; or run `archivist memory:bootstrap owner/repo` |
