# Security

## Secrets you may handle

| Secret | Used for |
|--------|----------|
| Model API keys | OpenAI / Anthropic / OpenRouter |
| `GITHUB_APP_ID` + private key + webhook secret | GitHub App server |
| `GITHUB_TOKEN` / `GH_TOKEN` | Optional CLI bootstrap |

## Rules

1. **Never commit** `.env`, PEM files, or tokens.
2. **Never put tokens in the repo** — not in README examples, issues, or commits.
3. Prefer **environment / host secret stores** in production.
4. **Rotate** any token that was pasted into chat, a ticket, a screenshot, or a git remote URL.
5. Use **fine-scoped PATs** when a token is required (public bootstrap needs almost nothing; avoid `repo` on all orgs unless needed).

## What the codebase does

- `.gitignore` includes `.env`, keys, and local data dirs
- Logger redacts key-like field names and values matching `sk-`, `ghp_`, `github_pat_`
- Docs use placeholders only (`your-key-here`, empty values in `.env.example`)

## If a secret was exposed

1. **Revoke/rotate** it immediately at the provider (GitHub → Settings → Developer settings → Tokens; OpenAI/Anthropic/OpenRouter dashboards).
2. Confirm it does not appear in `git log -p` or GitHub secret scanning alerts.
3. Update local `.env` and deployment secrets only.

## GitHub App least privilege

Recommended permissions:

- Pull requests: Read & write  
- Contents: Read-only  
- Metadata: Read-only  
- Checks: Read & write (optional)

Do not request org-wide admin scopes.

## Reporting

If you find a vulnerability in Archivist itself, open a private security advisory on the GitHub repo when available, or contact the maintainer without including live secrets in the report.
