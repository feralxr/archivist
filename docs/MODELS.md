# Model selection

Archivist is **provider-agnostic**. Each provider exposes many model ids — you can use **any** id your key can call. We ship a **curated catalog** for discovery; it is not a hard limit.

## Quick select

```bash
# Env (persistent)
ARCHIVIST_PROVIDER=openai
ARCHIVIST_MODEL=gpt-4o-mini
ARCHIVIST_REVIEW_MODEL=gpt-4o          # optional: review agent only

# CLI (per run)
archivist review --provider anthropic --model claude-sonnet-4-20250514
archivist models --list
archivist models --provider openrouter --list
```

## Priority

**Provider:** `--provider` → `ARCHIVIST_PROVIDER` → first available key (OpenRouter → Anthropic → OpenAI)

**Model id:** `--model` → `ARCHIVIST_REVIEW_MODEL` (review role) → `ARCHIVIST_MODEL` → provider default

## Agents / roles

| Role | Env | Used for |
|------|-----|----------|
| Review | `ARCHIVIST_REVIEW_MODEL` or `ARCHIVIST_MODEL` | PR / diff review |
| Embeddings | `ARCHIVIST_EMBEDDING_MODEL` | Memory search vectors |

Same provider key is reused; only the model id changes.

## Hundreds of models

OpenRouter, OpenAI, and Anthropic each publish large catalogs that change often. Archivist does **not** pin you to the curated list:

```bash
# OpenRouter — any id from https://openrouter.ai/models
ARCHIVIST_PROVIDER=openrouter
ARCHIVIST_MODEL=meta-llama/llama-3.3-70b-instruct

# OpenAI
ARCHIVIST_PROVIDER=openai
ARCHIVIST_MODEL=o4-mini

# Anthropic
ARCHIVIST_PROVIDER=anthropic
ARCHIVIST_MODEL=claude-opus-4-20250514
```

`archivist models --list` shows recommended ids only.

## Per-project tip

Put provider/model in the project `.env` next to the repo you review, or export vars in CI secrets per environment (cheap model in CI, stronger model in production App).
