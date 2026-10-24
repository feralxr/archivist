# Contributing to Archivist

## Product focus

Deepen these areas — don’t dilute them:

1. Project memory  
2. Review quality  
3. GitHub App reliability  
4. CLI UX  
5. Learning loop  
6. Docs & distribution  

## Dev setup

```bash
npm install
npm link
cp .env.example .env
# add a model key locally — never commit it
archivist doctor
npm run test:core
```

## Principles

- Fewer, better review comments  
- Memory must be explainable in output  
- Provider-agnostic model layer  
- **No secrets in commits, issues, or docs**  

## Pull requests

- Small, focused  
- Include a short “why”  
- For prompt/engine changes, attach before/after snippets when possible  
