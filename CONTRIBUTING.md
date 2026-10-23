# Contributing to Archivist

## Product focus

Deepen these sectors — don’t dilute them:

1. **Project memory** — accurate, durable, explainable
2. **Review quality** — high signal, low noise
3. **GitHub App** — reliable automatic reviews
4. **CLI** — excellent local workflow
5. **Learning loop** — improves from real human reviews
6. **Distribution** — clear install, docs, onboarding

## Dev setup

```bash
npm install
cp .env.example .env
# add OPENROUTER_API_KEY
npx tsx src/cli/index.ts doctor
```

## Principles

- Prefer fewer, better comments over noisy coverage
- Memory must be explainable in review output
- Never commit secrets (`.env`, PEM keys, tokens)
- Keep the default path working on free OpenRouter models

## Pull requests

- Small, focused PRs
- Include a short “why” in the description
- For review-quality changes, attach example model output before/after when possible
