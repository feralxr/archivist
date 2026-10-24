# Learning loop

Archivist gets better from **real review activity**, not only from hand-written rules.

## Flow

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
  used on the next review
```

## Automatic (GitHub App)

| Event | Learning |
|-------|----------|
| PR opened | Ingest existing review comments on that PR |
| Human submits review | Snippets + feedback; promote frequent items |
| App installed / repo added | Bootstrap from recent merged PRs |

## Local commands

```bash
archivist memory:bootstrap owner/repo --limit 40
archivist memory:learn
archivist memory:quality
archivist memory:consolidate
archivist memory:add -t style -c "..."
```

## Quality score

Heuristic 0–100 from counts of rules, architecture notes, patterns, feedback, snippets.

| Label | Meaning |
|-------|---------|
| empty | No useful memory yet |
| thin | A few rules; bootstrap or add more |
| useful | Enough to steer reviews |
| strong | Rich history + rules |

## Tips for strong memory quickly

1. `archivist init`  
2. Add 3–5 real style/architecture rules  
3. `memory:bootstrap` or install the GitHub App  
4. `memory:learn` periodically  
5. `memory:quality` until “useful” or better  
