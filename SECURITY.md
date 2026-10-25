# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.3.x   | Yes       |
| < 0.3   | Best effort |

## Reporting a vulnerability

Please **do not** open a public issue for security-sensitive reports.

- Prefer a private GitHub security advisory on this repository when available.
- Or contact the maintainer without including live secrets in the report.

## Secrets

Never commit:

- `.env` files with real keys
- GitHub PATs / App private keys / webhook secrets
- Model provider API keys

See [docs/SECURITY.md](docs/SECURITY.md) for operational guidance (redaction, rotation, least privilege).
