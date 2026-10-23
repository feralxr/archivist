# Learning loop

Archivist gets better the more real review activity it sees.

## How learning works

```
Human review comments
        ↓
  raw snippets + historical feedback
        ↓
  consolidate (merge duplicates)
        ↓
  promote frequent feedback → style rules / patterns
        ↓
  infer extra rules from concise snippets
        ↓
  used on the next PR review
```

## Automatic (GitHub App)

| Event | Learning |
|-------|----------|
| PR opened | Ingest existing review comments on that PR |
| Human submits review | Snippets + feedback; promote frequent items |
| Bootstrap (manual/API) | Last N merged PRs → memory seed |

## Local commands

```bash
archivist memory:learn      # consolidate + promote + infer
archivist memory:quality    # score 0–100 + tips
archivist memory:consolidate
```

## Quality score (heuristic)

- Style rules, architecture notes, patterns, feedback, snippets
- Labels: empty → thin → useful → strong
- Tips tell you what to add next

## Tips for strong memory fast

1. `archivist init`
2. Add 3–5 real style/architecture rules manually
3. Install the GitHub App so human reviews feed memory
4. Run `archivist memory:learn` periodically
5. `archivist memory:quality` until you’re in “useful” or “strong”
