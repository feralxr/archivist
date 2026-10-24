# Changelog

## 0.2.0

### Added
- OpenAI and Anthropic providers alongside OpenRouter
- `memory:bootstrap` from GitHub API (no App required)
- Global `--cwd` and `review --memory-id` for multi-repo workflows
- Auto-bootstrap when GitHub App is installed on a repo
- Docker + docker-compose production deploy
- PR labels `archivist:skip` / `skip-archivist`
- Diff stats (docs-only detection)
- Exhaustive `npm test` suite
- CI workflow (typecheck + core tests)

### Improved
- Provider-agnostic docs and `.env.example`
- Embeddings via OpenAI or OpenRouter
- Review quality post-processing and prompts
