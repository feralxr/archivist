# Install Archivist

## Option A — Local CLI (5 minutes)

```bash
git clone https://github.com/feralxr/archivist.git
cd archivist
npm install
cp .env.example .env
```

Add your OpenRouter key to `.env`:

```env
OPENROUTER_API_KEY=sk-or-...
ARCHIVIST_MODEL=recursive/flint-v1.0:free
```

```bash
npx tsx src/cli/index.ts doctor
npx tsx src/cli/index.ts init
npx tsx src/cli/index.ts memory:add -t style -c "Prefer early returns over nested ifs"
npx tsx src/cli/index.ts review    # reviews your current git diff
```

More: [CLI.md](./CLI.md)

## Option B — GitHub App (automatic PR reviews)

Full guide: [GITHUB_APP.md](./GITHUB_APP.md)

Short version:

1. Create a GitHub App with PR read/write + webhook
2. Set `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`
3. `npm run dev:server` (+ tunnel for local)
4. Install the app on a repository
5. Open a PR → Archivist reviews it

## Requirements

- Node.js 20+
- OpenRouter API key ([openrouter.ai](https://openrouter.ai) — free models available)
- For the App path: ability to receive GitHub webhooks (public URL or tunnel)
