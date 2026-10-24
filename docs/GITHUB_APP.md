# Archivist GitHub App — Setup

This is the product path: install once, get memory-aware reviews on every PR.

## 1. Create the GitHub App

1. Open https://github.com/settings/apps/new  
   (or **Organization settings → Developer settings → GitHub Apps** for an org)

2. Fill in:
   - **Name:** Archivist (or `Archivist for <org>`)
   - **Homepage URL:** `https://github.com/feralxr/archivist`
   - **Webhook URL:** `https://<your-host>/api/github/webhooks`
   - **Webhook secret:** generate a long random string and save it

3. **Repository permissions**
   - Pull requests: **Read & write**
   - Contents: **Read-only**
   - Metadata: **Read-only**

4. **Subscribe to events**
   - Pull request
   - Pull request review
   - Installation
   - Installation repositories

5. Create the app → **Generate a private key** → download the `.pem` file  
   Copy the **App ID** from the app page.

## 2. Configure environment

```bash
cp .env.example .env
```

```env
# Model — any supported provider
OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
# OPENROUTER_API_KEY=sk-or-...
ARCHIVIST_PROVIDER=openai
ARCHIVIST_MODEL=gpt-4o-mini

# GitHub App
GITHUB_APP_ID=123456
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your_webhook_secret

PORT=3000
```

For `GITHUB_PRIVATE_KEY`, either:
- Paste the PEM with literal `\n` for newlines, or
- Use a single-line env var with `\n` escapes

## 3. Run the server

```bash
npm install
npm run dev:server
```

Local webhook tunnel (pick one):

```bash
# cloudflared
cloudflared tunnel --url http://localhost:3000

# or ngrok
ngrok http 3000
```

Put the public HTTPS URL into the GitHub App webhook settings:
`https://<tunnel>/api/github/webhooks`

## 4. Install on a repository

1. GitHub App page → **Install App**
2. Choose the account / org
3. Select one repo (or all)
4. Confirm

## 5. Verify

1. Open a non-draft PR on an installed repo
2. Archivist should post a review within about a minute
3. Check server logs for `Review complete`
4. `GET /health` and `GET /ready` should return ok

## Behavior

| Event | Action |
|-------|--------|
| PR opened (non-draft) | Review + light ingest |
| PR synchronize (new commits) | Re-review (deduped per head SHA) |
| PR ready for review | Review (draft → ready) |
| Human review submitted | Learn into project memory |
| Bot PRs (Dependabot, etc.) | Skipped |
| Huge diffs | Notice comment, no full review |

## Production notes

- Run behind HTTPS only
- Set a strong `GITHUB_WEBHOOK_SECRET`
- Use a process manager (systemd, Docker, Railway, Fly, Render)
- Prefer a stable paid model from your provider for production traffic
- Free / shared-pool models (on any host) can rate-limit under load


## Bootstrap on install

When the app is installed on a repo, Archivist automatically scans recent merged PRs and seeds project memory.  
See [DEPLOY.md](./DEPLOY.md).
