# Install Archivist

## Requirements

- **Node.js 20+**
- A **model API key** from at least one of: OpenAI, Anthropic, OpenRouter
- Git (for local identity + diffs)

## Option A — Local CLI (recommended first)

```bash
git clone https://github.com/feralxr/archivist.git
cd archivist
npm install
npm link
cp .env.example .env
```

### Enable the short command

| Method | Command | Result |
|--------|---------|--------|
| Link (dev) | `npm link` (from the repo) | `archivist` on PATH |
| Global from GitHub | `npm install -g github:feralxr/archivist` | same |
| No link | `npm run archivist -- review` | longer form |

After `npm link`:

```bash
archivist --help
archivist doctor
```

### Configure a model

Edit `.env` (never commit this file):

```env
# At least one:
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
OPENROUTER_API_KEY=

# Optional:
ARCHIVIST_PROVIDER=openai
ARCHIVIST_MODEL=gpt-4o-mini
```

See [CONFIGURATION.md](./CONFIGURATION.md).

### First review

```bash
cd /path/to/your/project
archivist init
archivist memory:add -t style -c "Prefer early returns"
archivist review
```

If Archivist was linked from another directory, it still runs; memory is stored under the **current** project’s `.archivist/` (or `ARCHIVIST_DATA_DIR`).

### Verify

```bash
archivist doctor
npm test                 # from the archivist clone
```

---

## Option B — GitHub App (automatic reviews)

1. Complete Option A so you understand the product.
2. Follow [GITHUB_APP.md](./GITHUB_APP.md) to create the app.
3. Deploy the server: [DEPLOY.md](./DEPLOY.md).
4. Install the app on a repository.
5. Open a PR → Archivist comments + optional check run.

---

## Option C — Docker (App server only)

```bash
cp .env.example .env
# fill model + GitHub App vars
docker compose up -d --build
curl http://localhost:3000/health
```

Details: [DEPLOY.md](./DEPLOY.md).

---

## Updating

```bash
cd /path/to/archivist
git pull
npm install
npm run build    # optional; bin falls back to tsx if needed
```

If you used `npm link`, you usually do **not** need to re-link after pulls.
