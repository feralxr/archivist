# Archivist CLI — Local workflow

Industry-level local workflow for project memory and diff review.

## Install & configure

```bash
npm install
npm link              # once — then use `archivist` anywhere
cp .env.example .env
```

Set **any** provider key (one is enough):

```env
OPENAI_API_KEY=...
# or
ANTHROPIC_API_KEY=...
# or
OPENROUTER_API_KEY=...

ARCHIVIST_PROVIDER=openai          # optional
ARCHIVIST_MODEL=gpt-4o-mini        # match your provider
```

## Core commands

```bash
archivist init                 # create memory for this git repo
archivist status               # config + memory stats
archivist doctor               # health check

archivist memory               # inspect memory
archivist memory:list          # list all stored project memories
archivist memory:add -t style -c "Prefer early returns"
archivist memory:add -t architecture -c "API layer must not import UI"
archivist memory:add -t preferred -c "Zod for external input"
archivist memory:add -t discouraged -c "Don't use any"

archivist memory:consolidate   # merge duplicate feedback
archivist memory:learn         # promote + infer rules from evidence
archivist memory:bootstrap owner/repo   # learn from merged PR comments on GitHub
archivist memory:bootstrap https://github.com/tj/commander.js --limit 40
archivist memory:quality       # 0–100 score + tips
archivist memory:export -o mem.json
archivist memory:import -f mem.json

archivist review               # review current git diff (staged+unstaged)
archivist review --staged
archivist review --unstaged
archivist review --main        # against main/master
archivist review --file changes.diff
archivist review --json                    # machine-readable output
archivist review --fail-on error           # exit 1 if errors (CI)
archivist review --fail-on warning

archivist models               # show active provider + model
archivist tui                  # interactive memory inspector
```

## Multi-repo: `--cwd`

```bash
# Run Archivist as if you were inside another checkout
archivist --cwd /path/to/commander.js init
archivist --cwd /path/to/commander.js review --staged
archivist --cwd /path/to/commander.js memory
```

## Identity

Memory is keyed by `git remote get-url origin` when available  
(e.g. `github.com/org/repo`), so the same repo clones share identity intent.

## Typical loop

```bash
archivist init
archivist memory:add -t style -c "Use named exports"
# ... make changes ...
archivist review
archivist memory:learn
```
