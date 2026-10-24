# Releasing

Archivist is **Node.js / TypeScript**. Distribution is **npm + GitHub**, not PyPI.

## You do not need

- PyPI / pip / Python packaging  
- crates.io / RubyGems  

## GitHub (already in place)

- Source: https://github.com/feralxr/archivist  
- CI: typecheck + core tests on `main`  
- Optional: GitHub Release tags (`v0.2.x`) with notes from `CHANGELOG.md`

## npm (optional)

Enables `npm install -g archivist` / `npx archivist` from the registry.

1. npmjs.com account  
2. Confirm package name availability (`archivist` or `@feralxr/archivist`)  
3. Locally:

```bash
npm login
npm version patch
npm publish --access public
git push --tags
```

4. Optional: publish-on-tag workflow with `NPM_TOKEN` in GitHub secrets only.

## GitHub App (product release)

Users install your App and you host the webhook server ([DEPLOY.md](./DEPLOY.md)). That is independent of npm.

## Pre-1.0 checklist

- [ ] CI green  
- [ ] `npm run build` works  
- [ ] Docs match CLI (`archivist …`)  
- [ ] No secrets in git history  
- [ ] (Optional) npm publish  
- [ ] (Optional) Public App + production webhook URL  
