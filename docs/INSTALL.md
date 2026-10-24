# Install Archivist

## Option A — Local CLI (5 minutes)

```bash
git clone https://github.com/feralxr/archivist.git
cd archivist
npm install
npm link          # enables the `archivist` command
cp .env.example .env
```

Configure **at least one** model provider in `.env`:

```env
# Any one of these is enough
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
OPENROUTER_API_KEY=sk-or-...

# Optional
ARCHIVIST_PROVIDER=openai
ARCHIVIST_MODEL=gpt-4o-mini
```

```bash
archivist doctor
archivist init
archivist memory:add -t style -c "Prefer early returns over nested ifs"
archivist review    # reviews your current git diff
```

More: [CLI.md](./CLI.md)

## Option B — GitHub App (automatic PR reviews)

Full guide: [GITHUB_APP.md](./GITHUB_APP.md)

Short version:

1. Create a GitHub App with PR read/write + webhook
2. Set `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`
3. Set a model provider key (OpenAI, Anthropic, or OpenRouter)
4. `npm run dev:server` (+ tunnel for local)
5. Install the app on a repository
6. Open a PR → Archivist reviews it

## Requirements

- Node.js 20+
- A model API key from **any** supported provider:
  - [OpenAI](https://platform.openai.com/)
  - [Anthropic](https://console.anthropic.com/)
  - [OpenRouter](https://openrouter.ai/) (optional; useful if you want multi-model routing or free-tier models)
- For the App path: ability to receive GitHub webhooks (public URL or tunnel)

## Verify install

```bash
npm test
```

See [TESTING.md](./TESTING.md).
