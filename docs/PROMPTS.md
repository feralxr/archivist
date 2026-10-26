# Review prompt profiles

Archivist supports **multiple review personalities**. Pick one at setup or change anytime.

## Built-in profiles

| Id | Best for |
|----|----------|
| `balanced` | Most teams (default) |
| `strict` | High-compliance / merge-gating |
| `security` | AppSec-focused reviews |
| `mentor` | Coaching + still honest on defects |
| `minimal` | Only critical issues |
| `custom` | Your own system prompt file |

## Select

```bash
# Interactive (includes profile step)
archivist setup

# CLI
archivist prompt:list
archivist prompt:set strict
archivist prompt:set custom --file ./my-prompt.txt
archivist prompt:show

# Env
ARCHIVIST_PROMPT_PROFILE=security
ARCHIVIST_CUSTOM_PROMPT=/path/to/prompt.txt
```

## Custom prompts

Write a text file with your system instructions. If it does not define a JSON output contract, Archivist appends a standard one.

Minimum useful custom prompt: role, what to flag, what to ignore, severity rules.

## Priority

`ARCHIVIST_PROMPT_PROFILE` + optional `ARCHIVIST_CUSTOM_PROMPT` → resolved at review time via `resolveSystemPrompt()`.
