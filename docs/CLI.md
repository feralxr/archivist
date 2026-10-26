# CLI reference

After install (`npm link` or global install), the command is:

```bash
archivist <command> [options]
```

Global option (all commands):

| Flag | Description |
|------|-------------|
| `--cwd <path>` | Run as if the process started in this directory (multi-repo workflows) |
| `-V, --version` | Print version |
| `-h, --help` | Help |

---

## Setup & health

### `archivist setup`

Prints setup instructions (model keys, GitHub App overview).

### `archivist doctor`

Health check: keys, **resolved** review provider/model, GitHub App env, memory quality.
App-only fields are soft warnings for CLI use. Non-zero exit on hard failures.

```bash
archivist doctor
```

### `archivist status`

Short config + memory summary for the current repo identity.

### `archivist prompt:list` / `prompt:set` / `prompt:show`

```bash
archivist prompt:list
archivist prompt:set strict
archivist prompt:set custom --file ./my-prompt.txt
archivist prompt:show
```

See [PROMPTS.md](./PROMPTS.md).

### `archivist models`

Shows the active provider and model id resolved from env.

---

## Project memory

Memory is stored as JSON under `.archivist/` (or `ARCHIVIST_DATA_DIR`).  
Identity defaults to `git remote get-url origin` when available.

### `archivist init`

```bash
archivist init
archivist init -n my-repo-name
```

Creates memory for the current repo if missing.

### `archivist memory`

Human-readable dump of style rules, architecture notes, patterns, feedback counts.

```bash
archivist memory
archivist memory --json
```

### `archivist memory:list`

Lists all memory files in the data directory (all projects).

### `archivist memory:rm` / `memory:show`

```bash
archivist memory                 # list items (see ids in JSON / show)
archivist memory:show <id>
archivist memory:rm <id>         # prefix match ok
archivist memory:edit <id> -c "New rule text"
```

### `archivist memory:add`

```bash
archivist memory:add -t style -c "Prefer early returns"
archivist memory:add -t architecture -c "API layer must not import UI"
archivist memory:add -t preferred -c "Use Zod for external input"
archivist memory:add -t discouraged -c "Avoid any in public APIs"
```

| `-t` / `--type` | Meaning |
|-----------------|--------|
| `style` | Style rule |
| `architecture` | Architecture note |
| `preferred` | Preferred pattern |
| `discouraged` | Discouraged pattern |

### `archivist memory:search`

```bash
archivist memory:search "early return"
archivist memory:search "public API" -n 5
```

### `archivist explain`

Show how project memory relates to a topic or snippet:

```bash
archivist explain "error handling"
archivist explain "export function createUser"
```

### `archivist memory:consolidate`

Merges near-duplicate historical feedback and trims low-value snippets.

### `archivist memory:learn`

Full learning pass: consolidate → promote frequent feedback to rules → infer rules from snippets.

### `archivist memory:quality`

Scores memory 0–100 (`empty` → `thin` → `useful` → `strong`) and prints tips.

### `archivist memory:export` / `memory:import`

```bash
archivist memory:export -o backup.json
archivist memory:import -f backup.json
```

### `archivist memory:bootstrap <repo>`

Learn from **merged PR review comments** on GitHub (no App required).

```bash
archivist memory:bootstrap tj/commander.js
archivist memory:bootstrap https://github.com/tj/commander.js --limit 40
archivist memory:bootstrap owner/repo -t "$GITHUB_TOKEN"
```

| Option | Default | Description |
|--------|---------|-------------|
| `-n, --limit <n>` | `30` | Max closed PRs to scan |
| `-t, --token <token>` | env `GITHUB_TOKEN` / `GH_TOKEN` | PAT for rate limits / private repos |

Public repos work without a token (low rate limits). **Do not pass tokens on shared screen recordings.**

### `archivist tui`

Interactive terminal UI for browsing memory tabs.

---

## Review

### `archivist review`

Runs a memory-aware review on a diff.

```bash
# Current unstaged + staged changes
archivist review

# Sources of diff
archivist review --staged
archivist review --unstaged
archivist review --main
archivist review --file path/to.diff
archivist review --diff "raw diff string"

# Context & memory
archivist review --title "Fix login race"
archivist review --memory-id github.com/org/repo

# Automation
archivist review --json
archivist review --fail-on error
archivist review --fail-on warning
archivist review --fail-on suggestion
archivist review --report review.md
archivist review --save
archivist review --provider openai --model gpt-4o
archivist review --provider anthropic --model claude-sonnet-4-20250514
archivist models --list
archivist models --provider openrouter --list
archivist review:last
```

| Flag | Description |
|------|-------------|
| `-f, --file <path>` | Read diff from file |
| `-d, --diff <string>` | Inline diff |
| `--staged` | `git diff --cached` |
| `--unstaged` | `git diff` |
| `--main` | Against `main`/`master` |
| `--title <title>` | PR title context for the model |
| `--memory-id <id>` | Force memory id (e.g. after bootstrap) |
| `--json` | JSON on stdout |
| `--fail-on <level>` | Exit `1` if any comment at this severity or higher |

**Exit codes**

| Code | Meaning |
|------|---------|
| `0` | Success (and no fail-on threshold hit) |
| `1` | Findings met `--fail-on` threshold |
| `2` | Usage / config error (e.g. bad `--fail-on`) |

---

## Multi-repo: `--cwd`

```bash
archivist --cwd /path/to/other-repo init
archivist --cwd /path/to/other-repo review --staged
archivist --cwd /path/to/other-repo memory
```

---

## Typical workflows

### Solo developer

```bash
archivist init
archivist memory:add -t style -c "..."
# hack on code
archivist review
archivist memory:learn
```

### Seed from GitHub history

```bash
archivist memory:bootstrap acme/widget --limit 40
archivist review --file pr.diff --memory-id github.com/acme/widget
```

### CI gate

```bash
git diff origin/main...HEAD > /tmp/pr.diff
archivist review --file /tmp/pr.diff --fail-on warning --json
```

See [CI_REVIEW.md](./CI_REVIEW.md).
