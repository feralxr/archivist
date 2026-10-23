# Archivist

**Intelligent code review agent with deep project memory.**

Archivist learns your codebase's style, architecture decisions, and historical review patterns — then reviews pull requests with the context of a senior engineer who's been on the team for years.

> Built for large codebases and the coming wave of agentic coding.

## Vision

Most AI code review tools treat every PR in isolation.  
Archivist builds and maintains a living **project memory**:

- Coding style & conventions actually used in the repo
- Architecture decisions and constraints
- Historical review feedback patterns
- Preferred patterns vs anti-patterns

This memory powers high-signal, low-noise reviews that feel human.

## Status

Early foundation. Actively under development.

## Features (Planned)

- [x] Project foundation
- [ ] Fully model-agnostic layer (OpenRouter first)
- [ ] Project memory system
- [ ] GitHub App for automatic PR reviews
- [ ] Hybrid CLI + rich TUI
- [ ] Support for large codebases
- [ ] Extensible for agentic workflows

## Quick Start (Coming Soon)

```bash
npx archivist init
archivist memory status
archivist review <pr-url>
```

## Model Support

Archivist is designed to work with any model via OpenRouter (including free models). You can also bring your own API keys for Anthropic, OpenAI, Google, etc.

## License

MIT
