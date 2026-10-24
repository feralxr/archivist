# Using Archivist in CI

## Fail the job on review findings

```yaml
# .github/workflows/archivist-review.yml
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
          git fetch origin ${{ github.base_ref }}
          git diff origin/${{ github.base_ref }}...HEAD > /tmp/pr.diff
      - name: Review
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          # or ANTHROPIC_API_KEY / OPENROUTER_API_KEY
          ARCHIVIST_PROVIDER: openai
          ARCHIVIST_MODEL: gpt-4o-mini
        run: |
          cd /tmp/archivist
          npx tsx src/cli/index.ts --cwd "$GITHUB_WORKSPACE" init || true
          npx tsx src/cli/index.ts --cwd "$GITHUB_WORKSPACE" review --file /tmp/pr.diff --fail-on warning
```

Prefer the **GitHub App** for inline PR comments; use CI `--fail-on` when you want the status check to block merge.
