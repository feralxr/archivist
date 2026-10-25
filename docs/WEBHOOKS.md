# Webhook reliability & retries

## How GitHub retries

If your server responds with a **non-2xx** status, GitHub **redelivers** the webhook with the same `X-GitHub-Delivery` id (exponential backoff, up to about 24 hours).

Archivist is designed for that:

1. **Handler throws** on failure → middleware returns **500** → GitHub retries  
2. **Successful deliveries** are remembered by delivery id → duplicates are skipped  
3. **Model calls** use internal `withRetry` (rate limits / 5xx) before failing the delivery  
4. **PR head SHA dedupe** avoids double reviews on `synchronize` storms  
5. **Posts to GitHub** (comments/checks) use their own short retries; check runs soft-fail  

## Idempotency keys

| Key | Purpose |
|-----|---------|
| `X-GitHub-Delivery` | Exactly-once success per delivery id |
| `repo:pr:sha` | Skip re-review of same head commit |

## Metrics

`GET /metrics` includes:

- `webhooksReceived`, `webhookRetries`, `webhookDuplicates`
- `webhookCompleted`, `webhookFailures`
- `deliveries`: `{ tracked, processing, completed, failed }`

## Operational tips

- Always use HTTPS and a strong `GITHUB_WEBHOOK_SECRET`
- Watch GitHub App → **Advanced** → Recent Deliveries for red/green
- Failed deliveries show response code; 500 means Archivist asked for a retry
- Learning handlers (inline comments) catch errors internally so a flaky promote does not block the delivery
- Prefer stable model providers in production to reduce retry storms

## What is *not* retried as a full delivery failure

- Empty diffs / draft skips / `archivist:skip` label (clean 200, no work)
- Check-run permission missing (logged warning, review still posted)
