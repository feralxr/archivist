# Archivist in CI

Use the CLI as a **merge gate**. For inline PR comments, prefer the [GitHub App](./GITHUB_APP.md).

## Example workflow

```yaml
name: Archivist review
on:
  pull_request:

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: Install Archivist
        run: |
          git clone --depth 1 https://github.com/feralxr/archivist.git /tmp/archivist
          cd /tmp/archivist && npm install

      - name: Diff against base
        run: |
          git fetch origin "${{ github.base_ref }}"
          git diff "origin/${{ github.base_ref }}...HEAD" > /tmp/pr.diff

      - name: Review
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          # or ANTHROPIC_API_KEY / OPENROUTER_API_KEY
          ARCHIVIST_PROVIDER: openai
          ARCHIVIST_MODEL: gpt-4o-mini
        run: |
          cd /tmp/archivist
          npx archivist --cwd "$GITHUB_WORKSPACE" init || true
          npx archivist --cwd "$GITHUB_WORKSPACE" review \
            --file /tmp/pr.diff \
            --fail-on warning
```

Store model keys in **GitHub Actions secrets**, never in the workflow file.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | No findings at or above `--fail-on` |
| 1 | Findings triggered fail-on |
| 2 | Bad flags / missing config |
