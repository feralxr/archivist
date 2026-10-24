# Releasing Archivist

Archivist is a **Node.js / TypeScript** project. It publishes (or will publish) to **npm**, not PyPI.

## You do **not** need

- PyPI / `pip` / Python packaging  
- Cargo / crates.io  
- RubyGems  

## What you need for a real release

### 1. GitHub (already working)

- Source of truth: https://github.com/feralxr/archivist  
- CI: `.github/workflows/ci.yml`  
- Optional: GitHub Releases (tag `v0.2.2`, notes from `CHANGELOG.md`)

### 2. npm (when you want `npx archivist` / `npm i -g archivist`)

1. Create an account at https://www.npmjs.com  
2. Verify the package name `archivist` is available (or publish as `@feralxr/archivist`)  
3. Locally:

```bash
npm login
npm version patch   # or minor / major
npm publish --access public
git push --tags
```

4. Optional CI publish on tag:

```yaml
# sketch only — add when ready
on:
  push:
    tags: ["v*"]
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          registry-url: https://registry.npmjs.org
      - run: npm install
      - run: npm run build
      - run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Store `NPM_TOKEN` in GitHub Actions secrets — never commit it.

### 3. GitHub App (product distribution)

Users install your **GitHub App**, not a language package.  
You need:

- A running server (Docker / Fly / Railway / Render) — see [DEPLOY.md](./DEPLOY.md)  
- GitHub App credentials in env  
- A model provider key  

### 4. Right now (pre-npm)

Users can already:

```bash
git clone https://github.com/feralxr/archivist.git
cd archivist && npm install
npx tsx src/cli/index.ts ...
```

That is enough until you publish to npm.

## Checklist before calling it 1.0

- [ ] CI green  
- [ ] `npm run build` works  
- [ ] `npm publish` (optional)  
- [ ] Public GitHub App + hosted webhook URL  
- [ ] README install path matches reality  
